import axios from "axios"
import yts from "yt-search"
import fs from "fs"
import path from "path"
import ffmpeg from "fluent-ffmpeg"
import { promisify } from "util"
import { pipeline } from "stream"

const streamPipe = promisify(pipeline)
const API_BASE = process.env.API_BASE || "https://api-sky.ultraplus.click"
const API_KEY  = process.env.API_KEY  || "Russellxz"
const searchCache = new Map()

function cleanTmp(dir, maxAgeMinutes = 10) {
  if (!fs.existsSync(dir)) return
  fs.readdirSync(dir).forEach(file => {
    const full = path.join(dir, file)
    const age = (Date.now() - fs.statSync(full).mtimeMs) / 60000
    if (age > maxAgeMinutes) fs.unlinkSync(full)
  })
}

async function downloadToFile(url, filePath, retries = 3) {
  try {
    const res = await axios.get(url, { 
      responseType: "stream",
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 15000
    })
    await streamPipe(res.data, fs.createWriteStream(filePath))
    return filePath
  } catch (err) {
    if (retries > 0) return await downloadToFile(url, filePath, retries - 1)
    throw new Error("Fallo al descargar archivo: " + err.message)
  }
}

function fileSizeMB(filePath) {
  return fs.statSync(filePath).size / (1024 * 1024)
}

// ================= API HANDLERS =================
async function callSky(url) {
  const r = await axios.get(`${API_BASE}/api/download/yt.php`, {
    params: { url, format: "audio" },
    headers: { Authorization: `Bearer ${API_KEY}` },
    timeout: 10000
  })
  if (!r.data || r.data.status !== "true" || !r.data.data)
    throw new Error("API SKY inválida")
  return { api: "SKY", data: r.data.data, bitrate: 128, audio: r.data.data.audio }
}

async function callAdonix(url) {
  // ⚡ Ahora pide calidad 68 kbps
  const apiUrl = `https://adonixapi.site/api/v1/ytmp3?url=${encodeURIComponent(url)}&quality=68`
  const r = await axios.get(apiUrl, { timeout: 10000 })
  if (!r.data?.success || !r.data?.result?.url)
    throw new Error("API Adonix inválida")
  return { api: "Adonix", data: { audio: r.data.result.url }, bitrate: 68, audio: r.data.result.url }
}

// 🚀 Primer que responda gana, con hasta 3 reintentos
async function fastApi(videoUrl, conn, msg) {
  let intentos = 0
  while (intentos < 3) {
    try {
      const winner = await Promise.any([callSky(videoUrl), callAdonix(videoUrl)])
      await conn.sendMessage(msg.key.remoteJid, { react: { text: "🔁", key: msg.key } })
      return winner
    } catch (err) {
      intentos++
      if (intentos >= 3) throw new Error("Todas las APIs fallaron después de 3 intentos.")
      await new Promise(r => setTimeout(r, 2000)) // espera 2s entre intentos
    }
  }
}

// ================= VIDEO SEARCH =================
async function getVideoData(query) {
  if (searchCache.has(query)) return searchCache.get(query)
  const res = await yts(query)
  const video = res.videos?.[0]
  if (video) searchCache.set(query, video)
  return video
}

// ================= AUDIO DOWNLOAD =================
async function downloadAudioFile(conn, msg, mediaUrl, title, bitrate) {
  const chatId = msg.key.remoteJid
  const tmp = path.join(process.cwd(), "tmp")
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true })
  cleanTmp(tmp)

  const ext = (new URL(mediaUrl).pathname.split(".").pop() || "").toLowerCase()
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
          .outputOptions("-y")
          .on("end", resolve)
          .on("error", reject)
          .save(tryOut)
      )
      outFile = tryOut
      try { fs.unlinkSync(inFile) } catch {}
    } catch { outFile = inFile }
  }

  if (fileSizeMB(outFile) > 99) {
    try { fs.unlinkSync(outFile) } catch {}
    return await conn.sendMessage(chatId, { text: `❌ El archivo pesa más de 99MB.` }, { quoted: msg })
  }

  const buffer = fs.readFileSync(outFile)
  await conn.sendMessage(chatId, {
    audio: buffer,
    mimetype: "audio/mpeg",
    fileName: `${title}.mp3`
  }, { quoted: msg })

  try { fs.unlinkSync(outFile) } catch {}
}

// ================= HANDLER =================
const handler = async (msg, { conn, text }) => {
  const chatId = msg.key.remoteJid
  const pref = global.prefixes?.[0] || "."

  if (!text?.trim())
    return conn.sendMessage(chatId, { text: `✳️ Usa: ${pref}play <término>` }, { quoted: msg })

  await conn.sendMessage(chatId, { react: { text: "🕒", key: msg.key } })

  const video = await getVideoData(text)
  if (!video) return conn.sendMessage(chatId, { text: "❌ Sin resultados." }, { quoted: msg })

  const { url: videoUrl, title, author, timestamp: duration, thumbnail } = video

  const caption = `
🎧 *DESCARGANDO AUDIO...*

🎵 Título: ${title}
🎤 Artista: ${author?.name || "Desconocido"}
🕒 Duración: ${duration}
📡 Fuente: YouTube
`.trim()

  await conn.sendMessage(chatId, { image: { url: thumbnail }, caption }, { quoted: msg })

  // Descarga y envío del audio en segundo plano
  fastApi(videoUrl, conn, msg).then(async result => {
    const mediaUrl = result.audio || result.data?.audio
    const bitrate = result.bitrate || 68
    if (!mediaUrl) throw new Error("No se obtuvo un enlace válido.")

    await downloadAudioFile(conn, msg, mediaUrl, title, bitrate)
    await conn.sendMessage(chatId, { react: { text: "✅", key: msg.key } })
  }).catch(async err => {
    await conn.sendMessage(chatId, { react: { text: "❌", key: msg.key } })
    await conn.sendMessage(chatId, { text: `❌ Error: ${err?.message || "Desconocido"}` }, { quoted: msg })
  })
}

handler.command = ["play", "audio"]
handler.help = ["play <término>", "audio <nombre>"]
handler.tags = ["descargas"]

export default handler