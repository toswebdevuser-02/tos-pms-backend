/**
 * Outbound email via the SMTP settings stored in app settings (Settings UI).
 * Ported from the Electron handler (src/main/handlers/email.ts). The transport
 * is built fresh per call so a settings change takes effect immediately.
 */
import nodemailer, { Transporter } from 'nodemailer'
import { getSettings } from './store'

interface Smtp { host: string; port: number; secure: boolean; user: string; pass: string; from: string }

async function smtpConfig(): Promise<Smtp> {
  const s = (await getSettings()).smtp as unknown as Smtp
  return s
}

async function makeTransport(): Promise<{ transport: Transporter; smtp: Smtp } | null> {
  const smtp = await smtpConfig()
  if (!smtp.host || !smtp.user) return null
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 587,
    secure: !!smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass }
  })
  return { transport, smtp }
}

export async function emailTest(): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const t = await makeTransport()
    if (!t) return { ok: false, error: 'SMTP not configured (set host and username in Settings).' }
    await t.transport.verify()
    return { ok: true, data: { verified: true } }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export async function emailSend(msg: { to: string; subject: string; html: string }): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const to = String(msg.to ?? '').trim()
    const subject = String(msg.subject ?? '').trim()
    const html = String(msg.html ?? '')
    if (!to) return { ok: false, error: 'Recipient (to) is required' }
    if (!subject) return { ok: false, error: 'Subject is required' }
    if (!html) return { ok: false, error: 'Message body is required' }
    const t = await makeTransport()
    if (!t) return { ok: false, error: 'SMTP not configured (set host and username in Settings).' }
    const info = await t.transport.sendMail({ from: t.smtp.from || t.smtp.user, to, subject, html })
    return { ok: true, data: { messageId: info.messageId } }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
