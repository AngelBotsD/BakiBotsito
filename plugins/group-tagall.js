import { parsePhoneNumberFromString } from 'libphonenumber-js';

const handler = async (m, { conn, participants }) => {
  const total = participants.length;
  let texto = `*!  MENCION GENERAL  !*\n`;
  texto += `   *PARA ${total} MIEMBROS* \n\n`;

  for (const user of participants) {
    let numero = user.id.split('@')[0];

    // Asegurarse de que el número tenga el "+"
    if (!numero.startsWith('+')) numero = '+' + numero;

    const phoneNumber = parsePhoneNumberFromString(numero);
    
    // Función para convertir código ISO a emoji de bandera
    const countryCodeToFlagEmoji = (countryCode) =>
      countryCode
        ? String.fromCodePoint(...[...countryCode.toUpperCase()].map(c => 127397 + c.charCodeAt()))
        : '🏳️';

    const flag = countryCodeToFlagEmoji(phoneNumber?.country);
    texto += `┊» ${flag} @${numero.replace('+','')}\n`;
  }

  // Reacción inicial
  await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

  // Enviar mensaje con menciones
  await conn.sendMessage(m.chat, {
    text: texto,
    mentions: participants.map(p => p.id)
  }, { quoted: m });
};

// Configuración del comando
handler.customPrefix = /^\.?(todos)$/i;
handler.command = new RegExp();
handler.group = true;
handler.admin = true;

export default handler;