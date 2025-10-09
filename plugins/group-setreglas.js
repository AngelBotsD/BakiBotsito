let handler = async (m, { conn, text, isROwner, isOwner }) => {

if (text) {
global.db.data.chats[m.chat].sRules = text
conn.reply(m.chat, `𝙍𝙀𝙂𝙇𝘼𝙎 𝘼𝘾𝙏𝙐𝘼𝙇𝙄𝙕𝘼𝘿𝘼𝙎`, m)  

} else throw `𝘌𝘴𝘤𝘳𝘪𝘣𝘦 𝘭𝘢𝘴 𝘳𝘦𝘨𝘭𝘢𝘴 𝘥𝘦𝘭 𝘎𝘳𝘶𝘱𝘰`
}

handler.help = ['setreglas + Texto']
handler.tags = ['group']
handler.command = ['setreglas', 'nuevasreglas'] 
handler.admin = true
handler.group = true
export default handler