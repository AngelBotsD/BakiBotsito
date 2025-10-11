import { parsePhoneNumberFromString } from 'libphonenumber-js';

const handler = async (m, { conn, participants, groupMetadata }) => {
  const total = participants.length;
  let texto = `*!  MENCION GENERAL  !*\n`;
  texto += `   *PARA ${total} MIEMBROS* \n\n`;

  // Cambia esto según el país principal de tu grupo
  const defaultCountryCode = 'CO'; // 🇨🇴 Colombia

  // Función para convertir código ISO a emoji de bandera
  const countryCodeToFlagEmoji = (countryCode) =>
    countryCode
      ? String.fromCodePoint(...[...countryCode.toUpperCase()].map(c => 127397 + c.charCodeAt()))
      : '🇺🇳';

  // Función para obtener la bandera de cada participante
  const getFlagFromParticipant = (user) => {
    let lid = user.id.split('@')[0]; // extraer lid o número

    if (!lid.match(/^\d+$/)) {
      // si no es un número, usamos la bandera del grupo
      return countryCodeToFlagEmoji(defaultCountryCode);
    }

    // agregar + para libphonenumber
    const numero = '+' + lid;
    const phoneNumber = parsePhoneNumberFromString(numero);

    return phoneNumber?.country
      ? countryCodeToFlagEmoji(phoneNumber.country)
      : countryCodeToFlagEmoji(defaultCountryCode);
  };

  for (const user of participants) {
    const flag = getFlagFromParticipant(user);
    const display = user.id.split('@')[0]; // mostrar lid o número
    texto += `┊» ${flag} @${display}\n`;
  }

  // Reacción inicial
  await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

  // Enviar mensaje con menciones
  await conn.sendMessage(
    m.chat,
    { text: texto, mentions: participants.map((p) => p.id) },
    { quoted: m }
  );
};

// Configuración del comando
handler.customPrefix = /^\.?(todos)$/i;
handler.command = new RegExp();
handler.group = true;
handler.admin = true;

export default handler;