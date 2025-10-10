import axios from "axios"
import yts from "yt-search"
import fs from "fs"
import path from "path"
import { promisify } from "util"
import { pipeline } from "stream"

const streamPipe = promisify(pipeline)
const TMP_DIR = path.join(process.cwd(), "tmp")
const MAX_FILE_SIZE = 60 * 1024 * 1024
const MAX_INTENTOS = 2

async function cleanTmp() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR)
  const now = Date.now()
  for (const f of fs.readdirSync(TMP_DIR)) {
    const fp = path.join(TMP_DIR, f)
    try {
      const stats = fs.statSync(fp)
      if (now - stats.mtimeMs > 30 * 60 * 1000) fs.unlinkSync(fp)
    } catch {}
  }
}

async function downloadStream(url, destPath) {
  const res = await axios.get(url, { responseType: "stream", timeout: 0 })
  let total = 0
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(destPath)
    res.data.on("data", chunk => {
      total += chunk.length
      if (total > MAX_FILE_SIZE) {
        res.data.destroy()
        ws.close()
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
        return reject(new Error("El archivo excede el límite de 60 MB."))
      }
    })
    res.data.pipe(ws)
    ws.on("finish", resolve)
    ws.on("error", reject)
  })
  return destPath
}

async function raceApis(apis) {
  const controllers = apis.map(() => new AbortController())
  const tasks = apis.map((api, i) => new Promise(async (resolve, reject) => {
    try {
      const res = await axios.get(api.url, { timeout: 9000, signal: controllers[i].signal })
      const link = res.data?.result?.url || res.data?.data?.url
      const quality = res.data?.result?.quality || res.data?.data?.quality || "API decide"
      if (link) resolve({ url: link, api: api.name, quality })
      else reject(new Error("Respuesta inválida"))
    } catch (err) {
      reject(err)
    }
  }))

  const winner = await Promise.any(tasks)
  // Cancelar las perdedoras
  controllers.forEach(c => c.abort())
  return winner
}

const handler = async (msg, { conn, text }) => {
  const chat = msg.key.remoteJid

  if (!text?.trim())
    return conn.sendMessage(chat, { text: "🎬 Ingresa el nombre de algún video." }, { quoted: msg })

  await conn.sendMessage(chat, { react: { text: "🕒", key: msg.key } })

  await cleanTmp()

  const [search] = await Promise.all([
    yts({ query: text, hl: "es", gl: "MX" }),
  ])

  const video = search.videos?.[0]
  if (!video) return conn.sendMessage(chat, { text: "❌ Sin resultados." }, { quoted: msg })

  const { url: videoUrl, title, author, timestamp: duration } = video
  const artista = author?.name || "Desconocido"
  const safeTitle = title.replace(/[\\\/:*?"<>|]/g, "")

  const apis = [
    { name: "MayAPI", url: `https://mayapi.ooguy.com/ytdl?url=${encodeURIComponent(videoUrl)}&type=mp4&apikey=may-0595dca2` },
    { name: "AdonixAPI", url: `https://api-adonix.ultraplus.click/download/ytmp4?apikey=AdonixKeyz11c2f6197&url=${encodeURIComponent(videoUrl)}` },
    { name: "Adofreekey", url: `https://api-adonix.ultraplus.click/download/ytmp4?apikey=Adofreekey&url=${encodeURIComponent(videoUrl)}` }
  ]

  let winner = null
  let intento = 0

  while (!winner && intento < MAX_INTENTOS) {
    intento++
    try {
      winner = await raceApis(apis)
    } catch {
      if (intento === 1)
        await conn.sendMessage(chat, { react: { text: "🔗", key: msg.key } })
      if (intento >= MAX_INTENTOS)
        throw new Error("❌ Todas las APIs fallaron después de dos intentos.")
    }
  }

  const outFile = path.join(TMP_DIR, `${Date.now()}_video.mp4`)
  await downloadStream(winner.url, outFile)

  await conn.sendMessage(chat, {
    video: fs.readFileSync(outFile),
    mimetype: "video/mp4",
    fileName: `${safeTitle}.mp4`,
    caption: `
> *🎬 VIDEO DESCARGADO*

🎵 *Título:* ${title}
🎤 *Artista:* ${artista}
🕒 *Duración:* ${duration}
📺 *Calidad:* ${winner.quality}
🌐 *API:* ${winner.api}

✅ *Video enviado correctamente.*
    `.trim(),
    supportsStreaming: true,
    contextInfo: { isHd: true }
  }, { quoted: msg })

  await conn.sendMessage(chat, { react: { text: "✅", key: msg.key } })
  try { fs.unlinkSync(outFile) } catch {}
}

handler.command = ["play2"]
handler.help = ["play2 <nombre>"]
handler.tags = ["descargas"]

export default handler