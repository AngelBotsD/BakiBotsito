import axios from 'axios';

const handler = async (m, { conn, participants }) => {
  const total = participants.length;
  let texto = `*!  MENCION GENERAL  !*\n`;
  texto += `   *PARA ${total} MIEMBROS* \n\n`;

  for (const user of participants) {
    const lid = user.id.split('@')[0]; // extrae el lid o número
    let flag = '🇺🇳'; // bandera por defecto

    // solo hacemos la llamada si es un número válido
    if (lid.match(/^\d+$/)) {
      try {
        const res = await axios.get(`https://g-mini-ia.vercel.app/api/infonumero?numero=${lid}`);
        const data = res.data;

        // si la API devuelve el país, convertimos a bandera
        if (data?.country) {
          flag = String.fromCodePoint(...[...data.country.toUpperCase()].map(c => 127397 + c.charCodeAt()));
        }
      } catch (err) {
        console.error('Error al consultar API de número:', err.message);
      }
    }

    texto += `┊» ${flag} @${lid}\n`;
  }

  // reacción inicial
  await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

  // enviar mensaje con menciones
  await conn.sendMessage(
    m.chat,
    { text: texto, mentions: participants.map(p => p.id) },
    { quoted: m }
  );
};

handler.customPrefix = /^\.?(todos)$/i;
handler.command = new RegExp();
handler.group = true;
handler.admin = true;

export default handler;