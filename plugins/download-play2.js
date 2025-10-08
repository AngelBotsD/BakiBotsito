import axios from "axios"
import yts from "yt-search"
import fs from "fs"
import path from "path"
import { promisify } from "util"
import { pipeline } from "stream"

const streamPipe = promisify(pipeline)
const MAX_FILE_SIZE = 60 * 1024 * 1024
const MAX_INTENTOS = 2

const handler = async (msg, { conn, text }) => {
  if (!text || !text.trim())
    return conn.sendMessage(msg.key.remoteJid, { text: "🎬 Ingresa el nombre de algún video" }, { quoted: msg })

  await conn.sendMessage(msg.key.remoteJid, { react: { text: "🕒", key: msg.key } })

  const search = await yts({ query: text, hl: "es", gl: "MX" })
  const video = search.videos[0]
  if (!video)
    return conn.sendMessage(msg.key.remoteJid, { text: "❌ Sin resultados." }, { quoted: msg })

  const { url: videoUrl, title, timestamp: duration, author } = video
  const artista = author.name
  const safeTitle = title ? title.replace(/[\\\/:*?"<>|]/g, "") : "video"

  const apis = [
    { name: "MayAPI", url: `https://mayapi.ooguy.com/ytdl?url=${encodeURIComponent(videoUrl)}&type=mp4&apikey=may-0595dca2` },
    { name: "AdonixAPI", url: `https://api-adonix.ultraplus.click/download/ytmp4?apikey=AdonixKeyz11c2f6197&url=${encodeURIComponent(videoUrl)}` },
    { name: "Adofreekey", url: `https://api-adonix.ultraplus.click/download/ytmp4?apikey=Adofreekey&url=${encodeURIComponent(videoUrl)}` }
  ]

  const tryDownload = async () => {
    let winner = null
    let intentos = 0
    while (!winner && intentos < MAX_INTENTOS) {
      intentos++
      try {
        const tasks = apis.map(api => new Promise(async (resolve, reject) => {
          const controller = new AbortController()
          try {
            const r = await axios.get(api.url, { timeout: 12000, signal: controller.signal })
            const link = r.data?.result?.url || r.data?.data?.url
            const quality = r.data?.result?.quality || r.data?.data?.quality || "API decide"
            if (r.data?.status && link) resolve({ url: link, api: api.name, quality, controller })
            else reject(new Error("Sin link válido"))
          } catch (err) {
            if (!err.message.toLowerCase().includes("aborted")) reject(err)
          }
        }))
        winner = await Promise.any(tasks)
        tasks.forEach(t => { if (t !== winner && t.controller) t.controller.abort() })
      } catch (e) {
        if (intentos === 1)
          await conn.sendMessage(msg.key.remoteJid, { react: { text: "🔗", key: msg.key } })
        if (intentos >= MAX_INTENTOS) throw new Error("No se pudo obtener el video después de 2 intentos.")
      }
    }
    return winner
  }

  const tmp = path.join(process.cwd(), "tmp")
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp)
  fs.readdirSync(tmp).forEach(f => { const filePath = path.join(tmp, f); if (fs.existsSync(filePath)) fs.unlinkSync(filePath) })

  try {
    const winner = await tryDownload()
    const file = path.join(tmp, `${Date.now()}_vid.mp4`)
    const dl = await axios.get(winner.url, { responseType: "stream", timeout: 0 })
    let totalSize = 0

    await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(file)
      dl.data.on("data", chunk => {
        totalSize += chunk.length
        if (totalSize > MAX_FILE_SIZE) {
          dl.data.destroy()
          if (fs.existsSync(file)) fs.unlinkSync(file)
          reject(new Error("El archivo excede el límite de 60 MB permitido por WhatsApp."))
        }
      })
      dl.data.on("error", err => reject(err))
      writeStream.on("finish", resolve)
      writeStream.on("error", reject)
      dl.data.pipe(writeStream)
    })

    await conn.sendMessage(msg.key.remoteJid, {
      video: fs.readFileSync(file),
      mimetype: "video/mp4",
      fileName: `${safeTitle}.mp4`,
      caption: `
> 𝚅𝙸𝙳𝙴𝙾 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳𝙴𝚁

⭒ 🎵 - Título: ${title}
⭒ 🎤 - Artista: ${artista}
⭒ 🕑 - Duración: ${duration}
⭒ 📺 - Calidad: ${winner.quality}
⭒ 🌐 - API: ${winner.api}

» VIDEO ENVIADO 🎧
      `.trim(),
      supportsStreaming: true,
      contextInfo: { isHd: true }
    }, { quoted: msg })

    if (fs.existsSync(file)) fs.unlinkSync(file)
    await conn.sendMessage(msg.key.remoteJid, { react: { text: "✅", key: msg.key } })
  } catch (e) {
    console.error(e)
    await conn.sendMessage(msg.key.remoteJid, { text: `⚠️ Error al descargar el video:\n\n${e.message}` }, { quoted: msg })
  }
}

handler.command = ["play2"]
export default handler