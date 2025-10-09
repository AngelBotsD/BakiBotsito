let handler = async (m, { conn }) => {
    let chat = global.db.data.chats[m.chat]
        if (chat.sRules) {
            let reglas = chat.sRules;
            m.reply(reglas);
        } else {
            m.reply('𝙀𝙡 𝙜𝙧𝙪𝙥𝙤 𝙣𝙤 𝙩𝙞𝙚𝙣𝙚 𝙧𝙚𝙜𝙡𝙖𝙨');
        }
}
handler.help = ['reglas']
handler.tags = ['group']
handler.command = ['reglas']
handler.group = true
export default handler