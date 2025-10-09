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
    timeout: 6000
  })
  if (!r.data || r.data.status !== "true" || !r.data.data)
    throw new Error("API SKY inválida")
  return { api: "SKY", data: r.data.data, bitrate: 128 }
}

async function callMayApi(url) {
  const apiUrl = `https://mayapi.ooguy.com/ytdl?url=${encodeURIComponent(url)}&type=mp3&quality=64&apikey=may-0595dca2`
  const r = await axios.get(apiUrl, { timeout: 6000 })
  if (!r.data || !r.data.status || !r.data.result)
    throw new Error("API MayAPI inválida")
  return { api: "MayAPI", data: { audio: r.data.result.url }, bitrate: 64 }
}

async function callAdonix(url) {
  const apiUrl = `https://api-adonix.ultraplus.click/download/ytmp3?apikey=SoyMaycol<3&url=${encodeURIComponent(url)}&quality=64`
  const r = await axios.get(apiUrl, { timeout: 6000 })
  if (!r.data || !r.data.result || !r.data.result.url)
    throw new Error("API Adonix inválida")
  return { api: "Adonix", data: { audio: r.data.result.url }, bitrate: 64 }
}

async function fastApi(videoUrl) {
  const tasks = [callSky(videoUrl), callMayApi(videoUrl), callAdonix(videoUrl)]
  return await Promise.any(tasks)
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
  if (!text || !text.trim()) {
    return conn.sendMessage(msg.key.remoteJid, { text: `✳️ Usa:\n${pref}play <término>\nEj: *${pref}play* bad bunny diles` }, { quoted: msg })
  }

  await conn.sendMessage(msg.key.remoteJid, { react: { text: "🕒", key: msg.key } })

  const res = await yts(text)
  const video = res.videos?.[0]
  if (!video) {
    return conn.sendMessage(msg.key.remoteJid, { text: "❌ Sin resultados." }, { quoted: msg })
  }

  const { url: videoUrl, title, author, timestamp: duration, thumbnail } = video

  let apiUsed = "Desconocida"
  let mediaUrl = null
  let bitrate = 64
  let attempt = 0
  let success = false
  let lastError = null

  while (attempt < 2 && !success) {
    try {
      if (attempt === 1)
        await conn.sendMessage(msg.key.remoteJid, { react: { text: "🔁", key: msg.key } })

      const result = await fastApi(videoUrl)
      apiUsed = result.api
      mediaUrl = result.data.audio || result.data.video
      bitrate = result.bitrate || 64
      if (!mediaUrl) throw new Error("No se pudo obtener audio")

      success = true
    } catch (err) {
      lastError = err
      attempt++
      if (attempt < 2) await new Promise(r => setTimeout(r, 1500))
    }
  }

  const caption = `
> *𝙰𝚄𝙳𝙸𝙾 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳𝙴𝚁*

⭒ 🎵 - *Título:* ${title}
⭒ 🎤 - *Artista:* ${author?.name || "Desconocido"}
⭒ 🕑 - *Duración:* ${duration}
⭒ 📺 - *Calidad:* ${bitrate}kbps
⭒ 🌐 - *API:* ${apiUsed}

» *Enviando audio…* 🎧
`.trim()

  await conn.sendMessage(msg.key.remoteJid, { image: { url: thumbnail }, caption }, { quoted: msg })

  if (success && mediaUrl) {
    downloadAudioFile(conn, msg, mediaUrl, title, bitrate).then(() => {
      conn.sendMessage(msg.key.remoteJid, { react: { text: "✅", key: msg.key } })
    }).catch(async err => {
      await conn.sendMessage(msg.key.remoteJid, { react: { text: "❌", key: msg.key } })
      await conn.sendMessage(msg.key.remoteJid, { text: `❌ Error: ${err?.message || "Desconocido"}` }, { quoted: msg })
    })
  } else {
    await conn.sendMessage(msg.key.remoteJid, { react: { text: "❌", key: msg.key } })
    await conn.sendMessage(msg.key.remoteJid, { text: `❌ No se pudo descargar el audio.\nError: ${lastError?.message || "Desconocido"}` }, { quoted: msg })
  }
}

handler.command = ["play", "audio"]
handler.help = ["play <término>", "audio <nombre>"]
handler.tags = ["descargas"]
export default handler