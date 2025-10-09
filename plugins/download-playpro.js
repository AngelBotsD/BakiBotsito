import axios from "axios";
import yts from "yt-search";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { promisify } from "util";
import { pipeline } from "stream";

const streamPipe = promisify(pipeline);

// ==== CONFIG DE TU API ====
const API_BASE = process.env.API_BASE || "https://api-sky.ultraplus.click";
const API_KEY  = process.env.API_KEY  || "Russellxz"; // <-- tu API Key

const pending = {};

async function downloadToFile(url, filePath) {
  const res = await axios.get(url, { responseType: "stream" });
  await streamPipe(res.data, fs.createWriteStream(filePath));
  return filePath;
}

function fileSizeMB(filePath) {
  return fs.statSync(filePath).size / (1024 * 1024);
}

async function callMyApi(url) {
  const r = await axios.get(`${API_BASE}/api/download/yt.php`, {
    params: { url, format: "audio" },
    headers: { Authorization: `Bearer ${API_KEY}` },
    timeout: 60000
  });
  if (!r.data?.status || !r.data.data) throw new Error("API inválida o sin datos");
  return r.data.data;
}

const handler = async (msg, { conn, text }) => {
  const pref = global.prefixes?.[0] || ".";

  if (!text?.trim()) {
    return conn.sendMessage(msg.key.remoteJid, {
      text: `✳️ Usa:\n${pref}play <término>\nEj: *${pref}play* bad bunny diles`
    }, { quoted: msg });
  }

  await conn.sendMessage(msg.key.remoteJid, { react: { text: "⏳", key: msg.key } });

  const res = await yts(text);
  const video = res.videos?.[0];
  if (!video) return conn.sendMessage(msg.key.remoteJid, { text: "❌ Sin resultados." }, { quoted: msg });

  const { url: videoUrl, title, timestamp: duration, views, author, thumbnail } = video;
  const viewsFmt = (views || 0).toLocaleString();

  // Enviar miniatura + info
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
❥ API: api-sky.ultraplus.click
`.trim()
  }, { quoted: msg });

  await conn.sendMessage(msg.key.remoteJid, { text: `🎶 Descargando audio: *${title}*` }, { quoted: msg });

  try {
    await downloadAudio(conn, videoUrl, title, msg);
    await conn.sendMessage(msg.key.remoteJid, { react: { text: "✅", key: msg.key } });
  } catch (e) {
    console.error(e);
    await conn.sendMessage(msg.key.remoteJid, { text: "❌ Error al descargar el audio." }, { quoted: msg });
  }
};

async function downloadAudio(conn, videoUrl, title, quoted) {
  const data = await callMyApi(videoUrl);
  const mediaUrl = data.audio || data.video;
  if (!mediaUrl) throw new Error("No se pudo obtener audio");

  const tmp = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });

  const urlPath = new URL(mediaUrl).pathname || "";
  const ext = (urlPath.split(".").pop() || "").toLowerCase();
  const inFile = path.join(tmp, `${Date.now()}_in.${ext || "bin"}`);
  await downloadToFile(mediaUrl, inFile);

  let outFile = inFile;
  if (ext !== "mp3") {
    const tryOut = path.join(tmp, `${Date.now()}_out.mp3`);
    try {
      await new Promise((resolve, reject) =>
        ffmpeg(inFile)
          .audioCodec("libmp3lame")
          .audioBitrate("128k")
          .format("mp3")
          .save(tryOut)
          .on("end", resolve)
          .on("error", reject)
      );
      outFile = tryOut;
      fs.unlinkSync(inFile);
    } catch { outFile = inFile; }
  }

  if (fileSizeMB(outFile) > 99) {
    fs.unlinkSync(outFile);
    return await conn.sendMessage(quoted.key.remoteJid, { text: "❌ El archivo de audio supera 99MB." }, { quoted });
  }

  const buffer = fs.readFileSync(outFile);
  await conn.sendMessage(quoted.key.remoteJid, {
    audio: buffer,
    mimetype: "audio/mpeg",
    fileName: `${title}.mp3`
  }, { quoted });

  try { fs.unlinkSync(outFile); } catch {}
}

handler.command = ["playpro", "song"];
handler.help = ["playpro <término>", "song <nombre>"];
handler.tags = ["descargas"];

export default handler;