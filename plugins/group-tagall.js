// Convierte código de país ISO (2 letras) a emoji de bandera
function countryCodeToFlagEmoji(code) {
  const OFFSET = 0x1F1E6 - 'A'.charCodeAt(0);
  return code.toUpperCase()
    .split('')
    .map(c => String.fromCodePoint(c.charCodeAt(0) + OFFSET))
    .join('');
}

// Función para detectar país desde número y generar bandera
function numberToFlag(number) {
  // Limpia el número quitando cualquier caracter que no sea dígito
  const cleanNumber = number.replace(/\D/g, '');

  // Código de país aproximado (1 a 3 dígitos)
  // Fuente: E.164 country codes, los más comunes
  const countryCodeMap = {
    '1': 'US',    // EE.UU. y Canadá
    '52': 'MX',   // México
    '44': 'GB',   // Reino Unido
    '34': 'ES',   // España
    '55': 'BR',   // Brasil
    '33': 'FR',   // Francia
    '49': 'DE',   // Alemania
    '91': 'IN',   // India
    '81': 'JP',   // Japón
    '61': 'AU',   // Australia
    // puedes agregar más o usar esta lista completa en JSON si quieres
  };

  // Buscamos el código más largo primero (3 dígitos max)
  for (let len = 3; len > 0; len--) {
    const code = cleanNumber.slice(0, len);
    if (countryCodeMap[code]) {
      return countryCodeToFlagEmoji(countryCodeMap[code]);
    }
  }

  return '🏳️'; // bandera por defecto si no se detecta
}

// Handler principal
const handler = async (m, { conn, participants }) => {
  const total = participants.length;
  let texto = `*!  MENCION GENERAL  !*\n`;
  texto += `   *PARA ${total} MIEMBROS* \n\n`;

  for (const user of participants) {
    const numero = user.id.split('@')[0];
    const flag = numberToFlag(numero);
    texto += `┊» ${flag} @${numero}\n`;
  }

  await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

  await conn.sendMessage(m.chat, {
    text: texto,
    mentions: participants.map(p => p.id)
  }, { quoted: m });
};

handler.customPrefix = /^\.?(todos)$/i;
handler.command = new RegExp();
handler.group = true;
handler.admin = true;
export default handler;