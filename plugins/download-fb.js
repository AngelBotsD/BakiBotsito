import fetch from "node-fetch";
import yts from "yt-search";

const API_BASE = "https://mayapi.ooguy.com/ytdl";

const getAudioUrl = async (videoUrl) => {
  const apiUrl = `${API_BASE}?url=${encodeURIComponent(videoUrl)}&type=mp3&quality=64&apikey=may-0595dca2`;

  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  const audioUrl = data?.result?.download?.url || data?.url;

  if (!audioUrl) throw new Error("No se pudo obtener el enlace de descarga");
  return audioUrl;
};

let handler = async (m, { conn }) => {
  const body = m.text?.trim();
  if (!body) return;

  if (!/^play4|.play4\s+/i.test(body)) return;

  const query = body.replace(/^(play4|.play4)\s+/i, "").trim();
  if (!query) {
    throw `⭐ Escribe el nombre de la canción\n\nEjemplo: play4 Bad Bunny - Monaco`;
  }

  try {
    await conn.sendMessage(m.chat, { react: { text: "🕒", key: m.key } });

    const searchResults = await yts({ query, hl: "es", gl: "ES" });
    const video = searchResults.videos[0];
    if (!video) throw new Error("No se encontró el video");

    if (video.seconds > 600) {
      throw "❌ El audio es muy largo (máximo 10 minutos)";
    }

    await conn.sendMessage(
      m.chat,
      {
        image: { url: video.thumbnail },
        caption: `*_${video.title}_*\n\n> 𝙱𝙰𝙺𝙸 - 𝙱𝙾𝚃 𝙳𝙴𝚂𝙲𝙰𝚁𝙶𝙰𝚂 💻`,
      },
      { quoted: m }
    );

    const audioUrl = await getAudioUrl(video.url);

    await conn.sendMessage(
      m.chat,
      {
        audio: { url: audioUrl },
        mimetype: "audio/mpeg",
        fileName: `${video.title.slice(0, 30)}.mp3`.replace(/[^\w\s.-]/gi, ""),
        ptt: false, // 🎵 Enviar como archivo normal, no nota de voz
      },
      { quoted: m }
    );

    await conn.sendMessage(m.chat, { react: { text: "✅", key: m.key } });
  } catch (error) {
    console.error("Error:", error);
    await conn.sendMessage(m.chat, { react: { text: "❌", key: m.key } });

    const msg =
      typeof error === "string"
        ? error
        : `❌ *Error:* ${error.message || "Ocurrió un problema"}\n\n` +
          `🔸 *Posibles soluciones:*\n` +
          `• Verifica el nombre de la canción\n` +
          `• Intenta con otro tema\n` +
          `• Prueba más tarde`;

    await conn.sendMessage(m.chat, { text: msg }, { quoted: m });
  }
};

handler.customPrefix = /^(play4|.play4)\s+/i;
handler.command = new RegExp();
handler.exp = 0;

export default handler;