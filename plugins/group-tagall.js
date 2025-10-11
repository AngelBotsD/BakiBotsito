import axios from 'axios';

const countryMap = {
  'Colombia': 'CO',
  'México': 'MX',
  'España': 'ES',
  // agrega más países si quieres
};

const handler = async (m, { conn, participants }) => {
  let texto = `*!  MENCION GENERAL  !*\n\n`;

  await Promise.all(participants.map(async user => {
    const lid = user.id.split('@')[0];
    let flag = '🇺🇳';

    if (lid.match(/^\d+$/)) {
      try {
        const res = await axios.get(`https://g-mini-ia.vercel.app/api/infonumero?numero=${lid}`);
        let country = res.data?.country;

        if (countryMap[country]) country = countryMap[country];

        if (country && country.length === 2) {
          flag = String.fromCodePoint(...[...country.toUpperCase()].map(c => 127397 + c.charCodeAt()));
        }
      } catch (err) {
        console.error(err);
      }
    }

    texto += `┊» ${flag} @${lid}\n`;
  }));

  await conn.sendMessage(m.chat, { text: texto, mentions: participants.map(p => p.id) }, { quoted: m });
};

handler.customPrefix = /^\.?(todos)$/i;
handler.command = new RegExp();
handler.group = true;
handler.admin = true;

export default handler;