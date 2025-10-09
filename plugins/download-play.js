import axios from "axios"
import yts from "yt-search"
import fs from "fs"
import path from "path"
import ffmpeg from "fluent-ffmpeg"
import { promisify } from "util"
import { pipeline } from "stream"

const streamPipe = promisify(pipeline)
const API_BASE = process.env.API_BASE || "https://api-sky.ultraplus.click"
const API_KEY = process.env.API_KEY || "Russellxz"

async function downloadToFile(url, filePath) {
  const res = await axios.get(url, { responseType: "stream" })
  await streamPipe(res.data, fs.createWriteStream(filePath))
  return filePath
}

function fileSizeMB(filePath) {
  const b = fs.statSync(filePath).size
  return b / (1024 * 1024)
}

async function callSky(url) {
  const r = await axios.get(`${API_BASE}/api/download/yt.php`, {
    params: { url, format: "audio" },
    headers: { Authorization: `Bearer ${API_KEY}` },
    timeout: 9000
  })
  if (!r.data || r.data.status !== "true" || !r.data.data)
    throw new Error("API SKY inválida")
  return { api: "SKY", data: r.data.data, bitrate: 128 }
}

async function callAdonix(url) {
  const apiUrl = `https://adonixapi.site/api/v1/ytmp3?url=${encodeURIComponent(url)}`
  const r = await axios.get(apiUrl, { timeout: 9000 })
  if (!r.data?.success || !r.data?.result?.url)
    throw new Error("API Adonix inválida")
  return { api: "Adonix", data: { audio: r.data.result.url }, bitrate: 128 }
}

async function fastApi(videoUrl, conn, msg, intento = 1) {
  try {
    const [sky, adx] = await Promise.allSettled([
      callSky(videoUrl),
      callAdonix(videoUrl)
    ])

    if (sky.status === "fulfilled") return sky.value
    if (adx.status === "fulfilled") return adx.value

    if (intento === 1) {
      await conn.sendMessage(msg.key.remoteJid, { react: { text: "🔁", key: msg.key } })
      return await fastApi(videoUrl, conn, msg, 2)
    }

    throw new Error("Todas las APIs fallaron incluso en reintento.")
  } catch {
    throw new Error("No se pudo obtener el audio (todas las APIs fallaron).")
  }
}

async function downloadAudioFile(conn, msg, mediaUrl, title, bitrate) {
  const chatId = msg.key.remoteJid
  const tmp = path.join(process.cwd(), "tmp")
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true })

  const urlPath = new URL(mediaUrl).pathname || ""
  const ext = (urlPath.split(".").pop() || "").toLowerCase()
  const isMp3 = ext === "mp3"
  const inFile = path.join(tmp, `${Date.now()}_in.${ext || "bin"}`)
  await downloadToFile(mediaUrl, inFile)

  let outFile = inFile
  if (!isMp3) {
    const tryOut = path.join(tmp, `${Date.now()}_out.mp3`)
    try {
      await new Promise((resolve, reject) =>
        ffmpeg(inFile)
          .audioCodec("libmp3lame")
          .audioBitrate(`${bitrate}k`)
          .format("mp3")
          .save(tryOut)
          .on("end", resolve)
          .on("error", reject)
      )
      outFile = tryOut
      try { fs.unlinkSync(inFile) } catch {}
    } catch {
      outFile = inFile
    }
  }

  const sizeMB = fileSizeMB(outFile)
  if (sizeMB > 99) {
    try { fs.unlinkSync(outFile) } catch {}
    await conn.sendMessage(chatId, { text: `❌ El archivo pesa ${sizeMB.toFixed(2)}MB (>99MB).` }, { quoted: msg })
    return
  }

  const buffer = fs.readFileSync(outFile)
  await conn.sendMessage(chatId, {
    audio: buffer,
    mimetype: "audio/mpeg",
    fileName: `${title}.mp3`
  }, { quoted: msg })

  try { fs.unlinkSync(outFile) } catch {}
}

const handler = async (msg, { conn, text }) => {
  const pref = global.prefixes?.[0] || "."
  const chatId = msg.key.remoteJid

  if (!text?.trim()) {
    return conn.sendMessage(chatId, { 
      text: `✳️ Usa:\n${pref}play <término>\nEj: *${pref}play* bad bunny diles` 
    }, { quoted: msg })
  }

  await conn.sendMessage(chatId, { react: { text: "⚡", key: msg.key } })

  const searchPromise = yts(text)
  let videoUrl, title, author, duration, thumbnail

  if (/youtu\.be|youtube\.com/.test(text)) {
    videoUrl = text
    title = "Audio de YouTube"
    author = { name: "Desconocido" }
    duration = "Desconocido"
    thumbnail = "https://i.imgur.com/wxZtq3D.png"
  } else {
    const res = await searchPromise
    const video = res.videos?.[0]
    if (!video) return conn.sendMessage(chatId, { text: "❌ Sin resultados." }, { quoted: msg })
    ;({ url: videoUrl, title, author, timestamp: duration, thumbnail } = video)
  }

  const apiPromise = fastApi(videoUrl, conn, msg)

  const caption = `
> *🎧 DESCARGANDO AUDIO...*

🎵 *Título:* ${title}
🎤 *Artista:* ${author?.name || "Desconocido"}
🕒 *Duración:* ${duration}
📡 *Fuente:* YouTube
`.trim()

  await conn.sendMessage(chatId, { image: { url: thumbnail }, caption }, { quoted: msg })

  try {
    const result = await apiPromise
    const mediaUrl = result.data.audio || result.data.video
    const bitrate = result.bitrate || 64
    if (!mediaUrl) throw new Error("No se obtuvo un enlace válido.")

    await downloadAudioFile(conn, msg, mediaUrl, title, bitrate)
    await conn.sendMessage(chatId, { react: { text: "✅", key: msg.key } })
  } catch (err) {
    await conn.sendMessage(chatId, { react: { text: "❌", key: msg.key } })
    await conn.sendMessage(chatId, { text: `❌ No se pudo descargar el audio.\n${err?.message || "Error desconocido"}` }, { quoted: msg })
  }
}

handler.command = ["play", "audio"]
handler.help = ["play <término>", "audio <nombre>"]
handler.tags = ["descargas"]
export default handler