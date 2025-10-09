import axios from "axios";
import yts from "yt-search";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { promisify } from "util";
import { pipeline } from "stream";

const streamPipe = promisify(pipeline);
const API_BASE = process.env.API_BASE || "https://api-sky.ultraplus.click";
const API_KEY = process.env.API_KEY || "Russellxz";

async function downloadToFile(url, filePath) {
  const res = await axios.get(url, { responseType: "stream" });
  await streamPipe(res.data, fs.createWriteStream(filePath));
  return filePath;
}

function fileSizeMB(filePath) {
  const b = fs.statSync(filePath).size;
  return b / (1024 * 1024);
}

async function callSky(url) {
  const r = await axios.get(`${API_BASE}/api/download/yt.php`, {
    params: { url, format: "audio" },
    headers: { Authorization: `Bearer ${API_KEY}` },
    timeout: 6000,
  });
  if (!r.data || r.data.status !== "true" || !r.data.data)
    throw new Error("API SKY inválida");
  return { api: "SKY", data: r.data.data };
}

async function callMayApi(url) {
  const apiUrl = `https://mayapi.ooguy.com/ytdl?url=${encodeURIComponent(
    url
  )}&type=mp3&quality=64&apikey=may-0595dca2`;
  const r = await axios.get(apiUrl, { timeout: 6000 });
  if (!r.data || !r.data.status || !r.data.result)
    throw new Error("API MayAPI inválida");
  return { api: "MayAPI", data: { audio: r.data.result.url } };
}

async function fastApi(videoUrl) {
  const tasks = [callSky(videoUrl), callMayApi(videoUrl)];
  return await Promise.any(tasks);
}

async function downloadAudio(conn, msg, videoUrl, title) {
  const chatId = msg.key.remoteJid;
  let attempt = 0;
  let success = false;
  let lastError = null;
  let apiUsed = "Desconocida";

  while (attempt < 2 && !success) {
    try {
      if (attempt === 1)
        await conn.sendMessage(chatId, { react: { text: "🔁", key: msg.key } });

      const { api, data } = await fastApi(videoUrl);
      apiUsed = api;
      const mediaUrl = data.audio || data.video;
      if (!mediaUrl) throw new Error("No se pudo obtener audio");

      const tmp = path.join(process.cwd(), "tmp");
      if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });

      const urlPath = new URL(mediaUrl).pathname || "";
      const ext = (urlPath.split(".").pop() || "").toLowerCase();
      const isMp3 = ext === "mp3";
      const inFile = path.join(tmp, `${Date.now()}_in.${ext || "bin"}`);
      await downloadToFile(mediaUrl, inFile);

      let outFile = inFile;
      if (!isMp3) {
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
          try { fs.unlinkSync(inFile); } catch {}
        } catch {
          outFile = inFile;
        }
      }

      const sizeMB = fileSizeMB(outFile);
      if (sizeMB > 99) {
        try { fs.unlinkSync(outFile); } catch {}
        await conn.sendMessage(chatId, { text: `❌ El archivo pesa ${sizeMB.toFixed(2)}MB (>99MB).` }, { quoted: msg });
        return apiUsed;
      }

      const buffer = fs.readFileSync(outFile);
      await conn.sendMessage(chatId, {
        audio: buffer,
        mimetype: "audio/mpeg",
        fileName: `${title}.mp3`,
      }, { quoted: msg });

      try { fs.unlinkSync(outFile); } catch {}
      success = true;
      return apiUsed;

    } catch (err) {
      lastError = err;
      attempt++;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  if (!success) {
    await conn.sendMessage(chatId, { react: { text: "❌", key: msg.key } });
    await conn.sendMessage(chatId, { text: `❌ No se pudo descargar el audio.\nError: ${lastError?.message || "Desconocido"}` }, { quoted: msg });
  }

  return apiUsed;
}

const handler = async (msg, { conn, text }) => {
  const pref = global.prefixes?.[0] || ".";
  if (!text || !text.trim()) {
    return conn.sendMessage(msg.key.remoteJid, { text: `✳️ Usa:\n${pref}play <término>\nEj: *${pref}play* bad bunny diles` }, { quoted: msg });
  }

  await conn.sendMessage(msg.key.remoteJid, { react: { text: "🕒", key: msg.key } });

  const res = await yts(text);
  const video = res.videos?.[0];
  if (!video) {
    return conn.sendMessage(msg.key.remoteJid, { text: "❌ Sin resultados." }, { quoted: msg });
  }

  const { url: videoUrl, title, author, timestamp: duration, thumbnail } = video;
  const apiUsed = await downloadAudio(conn, msg, videoUrl, title);

  const caption = `
> *𝙰𝚄𝙳𝙸𝙾 𝙳𝙾𝚆𝙽𝙻𝙾𝙰𝙳𝙴𝚁*

⭒ ִֶָ७ ꯭🎵˙⋆｡ - *𝚃𝚒́𝚝𝚞𝚕𝚘:* ${title}
⭒ ִֶָ७ ꯭🎤˙⋆｡ - *𝙰𝚛𝚝𝚒𝚜𝚝𝚊:* ${author?.name || "Desconocido"}
⭒ ִֶָ७ ꯭🕑˙⋆｡ - *𝙳𝚞𝚛𝚊𝚌𝚒ó𝚗:* ${duration}
⭒ ִֶָ७ ꯭📺˙⋆｡ - *𝙲𝚊𝚕𝚒𝚍𝚊𝚍:* 128kbps
⭒ ִֶָ७ ꯭🌐˙⋆｡ - *𝙰𝚙𝚒:* ${apiUsed}

» *𝘌𝘕𝘝𝘐𝘈𝘕𝘋𝘖 𝘈𝘜𝘋𝘐𝘖* 🎧
» *𝘈𝘎𝘜𝘈𝘙𝘋𝘓𝘌 𝘜𝘕 𝘗𝘖𝘊𝘖*...

⇆‌ ㅤ◁ㅤㅤ❚❚ㅤㅤ▷ㅤ↻

> \`\`\`© 𝖯𝗈𝗐𝖾𝗋𝖾𝗱 𝖻𝗒 hernandez.𝗑𝗒𝗓\`\`\`
`.trim();

  await conn.sendMessage(msg.key.remoteJid, { image: { url: thumbnail }, caption }, { quoted: msg });
  await conn.sendMessage(msg.key.remoteJid, { react: { text: "✅", key: msg.key } });
};

handler.command = ["play", "audio"];
handler.help = ["play <término>", "audio <nombre>"];
handler.tags = ["descargas"];
export default handler;