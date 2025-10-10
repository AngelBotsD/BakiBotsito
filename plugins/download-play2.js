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

// 🧹 Limpieza automática de tmp (archivos >30 min)
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

// 📥 Descarga con límite de tamaño y timeout de progreso
async function downloadStream(url, destPath) {
  const res = await axios.get(url, { responseType: "stream", timeout: 15000 })
  let total = 0
  let lastChunkTime = Date.now()

  const timer = setInterval(() => {
    if (Date.now() - lastChunkTime > 10000) {
      res.data.destroy()
    }
  }, 2000)

  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(destPath)
    res.data.on("data", chunk => {
      total += chunk.length
      lastChunkTime = Date.now()
      if (total > MAX_FILE_SIZE) {
        res.data.destroy()
        ws.close()
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
        clearInterval(timer)
        reject(new Error("El archivo excede el límite de 60 MB."))
      }
    })
    res.data.on("end", () => {
      clearInterval(timer)
      resolve()
    })
    res.data.on("error", err => {
      clearInterval(timer)
      reject(err)
    })
    ws.on("error", reject)
    res.data.pipe(ws)
  })

  return destPath
}

// 🧩 Compite entre APIs y cancela las perdedoras
async function raceApis(apis) {
  const controllers = apis.map(() => new AbortController())
  const timeoutMs = 10000 // timeout global de 10s

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Timeout global: ninguna API respondió.")), timeoutMs)
  )

  const tasks = apis.map((api, i) => (async () => {
    try {
      const res = await axios.get(api.url, { timeout: 9000, signal: controllers[i].signal })
      const link = res.data?.result?.url || res.data?.data?.url
      const quality = res.data?.result?.quality || res.data?.data?.quality || "API decide"
      if (link) return { url: link, api: api.name, quality }
      throw new Error("Respuesta inválida")
    } catch (err) {
      throw new Error(`${api.name}: ${err.message}`)
    }
  })())

  const winner = await Promise.race([Promise.any(tasks), timeoutPromise])
  controllers.forEach(c => c.abort())
  return winner
}

// 🎬 Comando principal
const handler = async (msg, { conn, text }) => {
  const chat = msg.key.remoteJid

  if (!text?.trim())
    return conn.sendMessage(chat, { text: "🎬 Ingresa el nombre de algún video." }, { quoted: msg })

  await conn.sendMessage(chat, { react: { text: "🕒", key: msg.key } })

  await cleanTmp()

  const search = await yts({ query: text, hl: "es", gl: "MX" })
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
    } catch (e) {
      console.log(`[❌ INTENTO ${intento}]`, e.message)
      if (intento === 1)
        await conn.sendMessage(chat, { react: { text: "🔗", key: msg.key } })
      if (intento >= MAX_INTENTOS)
        return conn.sendMessage(chat, { text: `❌ Error: ${e.message}` }, { quoted: msg })
    }
  }

  const outFile = path.join(TMP_DIR, `${Date.now()}_video.mp4`)

  try {
    await downloadStream(winner.url, outFile)
  } catch (err) {
    console.error("[❌ Error de descarga]", err)
    return conn.sendMessage(chat, { text: `⚠️ Error al descargar:\n${err.message}` }, { quoted: msg })
  }

  await conn.sendMessage(chat, {
    video: fs.readFileSync(outFile),
    mimetype: "video/mp4",
    fileName: `${safeTitle}.mp4`,
    caption: `
> 🎬 *VIDEO DESCARGADO*

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