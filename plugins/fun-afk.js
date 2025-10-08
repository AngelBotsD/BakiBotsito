// fun-afk.js
import pkg from '@whiskeysockets/baileys'
const { generateWAMessageFromContent, proto } = pkg

let afk = {
  isAFK: false,
  reason: '',
  user: ''
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  const from = m.chat
  const sender = m.sender

  // ===== Comando .afk =====
  if (command === 'afk') {
    if (!text) {
      return conn.sendMessage(from, { text: '⚠️ Escribe la razón de tu AFK, ej: .afk (hola)' }, { quoted: m })
    }

    afk = {
      isAFK: true,
      reason: text,
      user: sender
    }

    return conn.sendMessage(from, { text: `✅ Estás AFK por esta razón:\n\n${text}` }, { quoted: m })
  }

  // ===== Usuario vuelve del AFK =====
  if (afk.isAFK && sender === afk.user) {
    afk.isAFK = false
    const reply = '👋 Hola de vuelta hermosa'
    await conn.sendMessage(from, { text: reply }, { quoted: m })
  }

  // ===== Alguien menciona al usuario AFK =====
  if (afk.isAFK && m.mentionedJid && m.mentionedJid.includes(afk.user) && sender !== afk.user && !m.key.fromMe) {
    const reply = `⏳ Eliminé esa mención\n💬 ${afk.reason ? 'Motivo: ' + afk.reason : ''}`
    
    // Opcional: eliminar mensaje que mencionó al AFK (requiere permisos admin)
    try {
      await conn.sendMessage(from, { text: reply }, { quoted: m })
      await conn.sendMessage(from, { delete: m.key })
    } catch (e) {
      await conn.sendMessage(from, { text: reply }, { quoted: m })
    }
  }
}

handler.command = ['afk']
export default handler