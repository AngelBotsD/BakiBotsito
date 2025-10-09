import axios from "axios"
import yts from "yt-search"
import fs from "fs"
import path from "path"
import ffmpeg from "fluent-ffmpeg"
import { promisify } from "util"
import { pipeline } from "stream"

const streamPipe = promisify(pipeline)

// === CONFIG ===
const API_SKY = "https://api-sky.ultraplus.click/api/download/yt.php"
const API_MAY = "https://mayapi.ooguy.com/ytdl"
const API_KEY = "Russellxz"

async function downloadToFile(url, filePath) {
  const res = await axios.get(url, { responseType: "stream", timeout: 5000 })
  await streamPipe(res.data, fs.createWriteStream(filePath))
  return filePath
}

function fileSizeMB(filePath) {
  const b = fs.statSync(filePath).size
  return b / (1024 * 1024)
}

// === APIs ===
async function callSky(url) {
  const r = await axios.get(API_SKY, {
    params: { url, format: "audio" },
    headers: { Authorization: `Bearer ${API_KEY}` },
    timeout: 5000
  })
  if (!r.data?.status || !r.data.data) throw new Error("SKY sin datos")
  return { api: "SKY", data: r.data.data, bitrate: 128 }
}

async function callMayApi(url) {
  const r = await axios.get(API_MAY, {
    params: { url, type: "mp3", quality: 64, apikey: "may-0595dca2" },
    timeout: 5000
  })
  if (!r.data?.status || !r.data.result) throw new Error("MayAPI sin datos")
  return { api: "MayAPI", data: { audio: r.data.result.url }, bitrate: 64 }
}

// === Multi API con reintentos ===
async function fastApi(videoUrl) {
  const apis = [callSky, callMayApi]
  let lastError
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await Promise.any(apis.map(fn => fn(videoUrl)))
      return result
    } catch (err) {
      lastError = err
      if (attempt < 3) await new Promise(r => setTimeout(r, 5000))
    }
  }
  throw lastError
}

// === Descarga de audio ===
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
      fs.unlinkSync(inFile)
    } catch {
      outFile = inFile
    }
  }

  const sizeMB = fileSizeMB(outFile)
  if (sizeMB > 99) {
    fs.unlinkSync(outFile)
    return conn.sendMessage(chatId, { text: `❌ El archivo pesa ${sizeMB.toFixed(2)}MB (>99MB).` }, { quoted: msg })
  }

  const buffer = fs.readFileSync(outFile)
  await conn.sendMessage(chatId, {
    audio: buffer,
    mimetype: "audio/mpeg",
    fileName: `${title}.mp3`
  }, { quoted: msg })

  try { fs.unlinkSync(outFile) } catch {}
}

// === Handler principal ===
const handler = async (msg, { conn, text }) => {
  const pref = global.prefixes?.[0] || "."
  if (!text?.trim())
    return conn.sendMessage(msg.key.remoteJid, { text: `✳️ Usa:\n${pref}play <término>\nEj: *${pref}play* bad bunny diles` }, { quoted: msg })

  await conn.sendMessage(msg.key.remoteJid, { react: { text: "🕒", key: msg.key } })

  const res = await yts(text)
  const video = res.videos?.[0]
  if (!video)
    return conn.sendMessage(msg.key.remoteJid, { text: "❌ Sin resultados." }, { quoted: msg })

  const { url: videoUrl, title, author, timestamp: duration, thumbnail } = video

  // INFO instantánea
  const caption = `
> *𝙰𝚄𝙳𝙸𝙾 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳𝙴𝚁*

🎵 *Título:* ${title}
🎤 *Artista:* ${author?.name || "Desconocido"}
🕑 *Duración:* ${duration}
🌐 *API:* Multi API

» *Enviando audio...* 🎧
`.trim()

  await conn.sendMessage(msg.key.remoteJid, { image: { url: thumbnail }, caption }, { quoted: msg })

  // Descarga paralela
  ;(async () => {
    try {
      const result = await fastApi(videoUrl)
      const mediaUrl = result.data.audio || result.data.video
      if (!mediaUrl) throw new Error("No se obtuvo audio")
      await downloadAudioFile(conn, msg, mediaUrl, title, result.bitrate)
      conn.sendMessage(msg.key.remoteJid, { react: { text: "✅", key: msg.key } })
    } catch (err) {
      conn.sendMessage(msg.key.remoteJid, { react: { text: "❌", key: msg.key } })
      conn.sendMessage(msg.key.remoteJid, { text: `❌ Error: ${err.message}` }, { quoted: msg })
    }
  })()
}

handler.command = ["play3", "audio"]
handler.help = ["play <término>", "audio <nombre>"]
handler.tags = ["descargas"]

export default handler