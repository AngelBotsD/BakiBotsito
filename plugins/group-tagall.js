import axios from 'axios';

const handler = async (m, { conn, participants }) => {
  const total = participants.length;
  let texto = `*!  MENCION GENERAL  !*\n`;
  texto += `   *PARA ${total} MIEMBROS* \n\n`;

  for (const user of participants) {
    const lid = user.id.split('@')[0]; // Extraer el lid o número
    let flag = '🇺🇳'; // Bandera por defecto

    // Verificar si el lid es un número válido
    if (lid.match(/^\d+$/)) {
      try {
        // Hacer la solicitud a la API de Gemini
        const response = await axios.get(`https://g-mini-ia.vercel.app/api/infonumero?numero=${lid}`);
        const data = response.data;

        // Verificar si la respuesta contiene información del país
        if (data && data.country) {
          // Convertir el código del país a una bandera
          flag = String.fromCodePoint(...[...data.country.toUpperCase()].map(c => 127397 + c.charCodeAt()));
        }
      } catch (error) {
        console.error('Error al obtener información del número:', error);
      }
    }

    // Agregar la mención con la bandera correspondiente
    texto += `┊» ${flag} @${lid}\n`;
  }

  // Enviar el mensaje con menciones
  await conn.sendMessage(m.chat, { text: texto, mentions: participants.map(p => p.id) }, { quoted: m });
};

handler.customPrefix = /^\.?(todos)$/i;
handler.command = new RegExp();
handler.group = true;
handler.admin = true;

export default handler;