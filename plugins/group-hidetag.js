import { generateWAMessageFromContent } from '@whiskeysockets/baileys'
import fetch from 'node-fetch'

const handler = async (m, { conn, participants }) => {
    if (!m.isGroup || m.key.fromMe) return

    // === fkontak con icono ===
    const res = await fetch('https://i.postimg.cc/rFfVL8Ps/image.jpg')
    const thumb = Buffer.from(await res.arrayBuffer())
    const fkontak = {
        key: {
            participants: '0@s.whatsapp.net',
            remoteJid: 'status@broadcast',
            fromMe: false,
            id: 'Halo'
        },
        message: {
            locationMessage: {
                name: '𝖧𝗈𝗅𝖺, 𝖲𝗈𝗒 𝖡𝖺𝗄𝗂-𝖡𝗈𝗍',
                jpegThumbnail: thumb
            }
        },
        participant: '0@s.whatsapp.net'
    }

    const content = m.text || m.msg?.caption || ''
    if (!/^.?n(\s|$)/i.test(content.trim())) return

    await conn.sendMessage(m.chat, { react: { text: '🔊', key: m.key } })

    const userText = content.trim().replace(/^.?n\s*/i, '')
    const finalText = userText || ''

    try {
        const users = participants.map(u => conn.decodeJid(u.id))
        const q = m.quoted ? m.quoted : m
        const mtype = q.mtype || ''
        const isMedia = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage'].includes(mtype)
        const originalCaption = (q.msg?.caption || q.text || '').trim()
        const finalCaption = finalText || originalCaption || '🔊 Notificación'

        // === si cita un mensaje con media ===
        if (m.quoted && isMedia) {
            const media = await q.download()
            if (mtype === 'audioMessage') {
                await conn.sendMessage(m.chat, {
                    audio: media,
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    mentions: users
                }, { quoted: fkontak })

                if (finalText) {
                    await conn.sendMessage(m.chat, {
                        text: finalText,
                        mentions: users
                    }, { quoted: fkontak })
                }
            } else {
                if (mtype === 'imageMessage') await conn.sendMessage(m.chat, { image: media, caption: finalCaption, mentions: users }, { quoted: fkontak })
                if (mtype === 'videoMessage') await conn.sendMessage(m.chat, { video: media, caption: finalCaption, mentions: users, mimetype: 'video/mp4' }, { quoted: fkontak })
                if (mtype === 'stickerMessage') await conn.sendMessage(m.chat, { sticker: media, mentions: users }, { quoted: fkontak })
            }

        // === si cita texto ===
        } else if (m.quoted && !isMedia) {
            const msg = conn.cMod(
                m.chat,
                generateWAMessageFromContent(
                    m.chat,
                    { [mtype || 'extendedTextMessage']: q.message?.[mtype] || { text: finalCaption } },
                    { quoted: fkontak, userJid: conn.user.id }
                ),
                finalCaption,
                conn.user.jid,
                { mentions: users }
            )
            await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id })

        // === si manda media sin citar ===
        } else if (!m.quoted && isMedia) {
            const media = await m.download()
            if (mtype === 'audioMessage') {
                await conn.sendMessage(m.chat, {
                    audio: media,
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    mentions: users
                }, { quoted: fkontak })

                if (finalText) {
                    await conn.sendMessage(m.chat, {
                        text: finalText,
                        mentions: users
                    }, { quoted: fkontak })
                }
            } else {
                if (mtype === 'imageMessage') await conn.sendMessage(m.chat, { image: media, caption: finalCaption, mentions: users }, { quoted: fkontak })
                if (mtype === 'videoMessage') await conn.sendMessage(m.chat, { video: media, caption: finalCaption, mentions: users, mimetype: 'video/mp4' }, { quoted: fkontak })
                if (mtype === 'stickerMessage') await conn.sendMessage(m.chat, { sticker: media, mentions: users }, { quoted: fkontak })
            }

        // === si no hay cita ni media ===
        } else {
            await conn.sendMessage(m.chat, {
                text: finalCaption,
                mentions: users
            }, { quoted: fkontak })
        }

    } catch {
        const users = participants.map(u => conn.decodeJid(u.id))
        await conn.sendMessage(m.chat, {
            text: '🔊 Notificación',
            mentions: users
        }, { quoted: fkontak })
    }
}

handler.customPrefix = /^(\.n|n)(\s|$)/i
handler.command = new RegExp()
handler.group = true
handler.admin = true

export default handler