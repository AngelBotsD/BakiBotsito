import axios from "axios"
import yts from "yt-search"
import fs from "fs"
import path from "path"
import ffmpeg from "fluent-ffmpeg"
import { promisify } from "util"
import { pipeline } from "stream"

const streamPipe = promisify(pipeline)

// ==== CONFIG DE TU API ====
const API_BASE = process.env.API_BASE || "https://api-sky.ultraplus.click"
const API_KEY  = process.env.API_KEY  || "Russellxz"

async function downloadToFile(url, filePath) {
  const res = await axios.get(url, { responseType: "stream", timeout: 5000 })
  await streamPipe(res.data, fs.createWriteStream(filePath))
  return filePath
}

function fileSizeMB(filePath) {
  return fs.statSync(filePath).size / (1024 * 1024)
}

async function callSky(url) {
  const r = await axios.get(`${API_BASE}/api/download/yt.php`, {
    params: { url, format: "audio" },
    headers: { Authorization: `Bearer ${API_KEY}` },
    timeout: 5000
  })
  if (!r.data?.status || !r.data.data) throw new Error("API SKY inválida")
  return { api: "SKY", url: r.data.data.audio || r.data.data.video, bitrate: 128 }
}

async function callMyApi(url) {
  const r = await axios.get(`https://mayapi.ooguy.com/ytdl?url=${encodeURIComponent(url)}&type=mp3&quality=64&apikey=may-0595dca2`, { timeout: 5000 })
  if (!r.data?.status || !r.data.result) throw new Error("API MayAPI inválida")
  return { api: "Multi API", url: r.data.result.url, bitrate: 64 }
}

async function fastApi(videoUrl) {
  const tasks = [callSky(videoUrl), callMyApi(videoUrl)]
  return await Promise.any(tasks)
}

async function downloadAudioFile(conn, msg, mediaUrl, title, bitrate) {
  const chatId = msg.key.remoteJid
  const tmp = path.join(process.cwd(), "tmp")
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true })

  const urlPath = new URL(mediaUrl).pathname || ""
  const ext = (urlPath.split(".").pop() || "").toLowerCase()
  const inFile = path.join(tmp, `${Date.now()}_in.${ext || "bin"}`)
  await downloadToFile(mediaUrl, inFile)

  let outFile = inFile
  if (ext !== "mp3") {
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
      fs.unlinkSync(inFile)
    } catch { outFile = inFile }
  }

  if (fileSizeMB(outFile) > 99) {
    fs.unlinkSync(outFile)
    return await conn.sendMessage(chatId, { text: "❌ El archivo de audio supera 99MB." }, { quoted: msg })
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

  if (!text?.trim()) {
    return conn.sendMessage(msg.key.remoteJid, {
      text: `✳️ Usa:\n${pref}play <término>\nEj: *${pref}play* bad bunny diles`
    }, { quoted: msg })
  }

  await conn.sendMessage(msg.key.remoteJid, { react: { text: "⏳", key: msg.key } })

  const res = await yts(text)
  const video = res.videos?.[0]
  if (!video) return conn.sendMessage(msg.key.remoteJid, { text: "❌ Sin resultados." }, { quoted: msg })

  const { url: videoUrl, title, timestamp: duration, views, author, thumbnail } = video
  const viewsFmt = (views || 0).toLocaleString()

  // 📌 Info enviada al instante
  await conn.sendMessage(msg.key.remoteJid, {
    image: { url: thumbnail },
    caption: `
❦𝑳𝑨 𝑺𝑼𝑲𝑰 𝑩𝑶𝑻❦

📀 Info del video:
❥ Título: ${title}
❥ Duración: ${duration}
❥ Vistas: ${viewsFmt}
❥ Autor: ${author?.name || author || "Desconocido"}
❥ Link: ${videoUrl}
❥ API: SKY / Multi API
`.trim()
  }, { quoted: msg })

  let attempt = 0, success = false, lastError = null
  let apiUsed = "Desconocida", mediaUrl = null, bitrate = 64

  while (attempt < 3 && !success) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 5000)) // 5 seg
      const result = await fastApi(videoUrl)
      apiUsed = result.api
      mediaUrl = result.url
      bitrate = result.bitrate || 64
      if (!mediaUrl) throw new Error("No se pudo obtener audio")
      success = true
    } catch (err) {
      lastError = err
      attempt++
    }
  }

  if (success && mediaUrl) {
    // Descarga en paralelo al renderizado
    downloadAudioFile(conn, msg, mediaUrl, title, bitrate)
      .then(() => conn.sendMessage(msg.key.remoteJid, { react: { text: "✅", key: msg.key } }))
      .catch(async e => {
        await conn.sendMessage(msg.key.remoteJid, { react: { text: "❌", key: msg.key } })
        await conn.sendMessage(msg.key.remoteJid, { text: `❌ Error: ${e?.message || "Desconocido"}` }, { quoted: msg })
      })
  } else {
    await conn.sendMessage(msg.key.remoteJid, { react: { text: "❌", key: msg.key } })
    await conn.sendMessage(msg.key.remoteJid, { text: `❌ No se pudo descargar el audio.\nError: ${lastError?.message || "Desconocido"}` }, { quoted: msg })
  }
}

handler.command = ["playpro", "audiox"]
handler.help = ["play <término>", "audio <nombre>"]
handler.tags = ["descargas"]

export default handler