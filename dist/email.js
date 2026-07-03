"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailTest = emailTest;
exports.emailSend = emailSend;
/**
 * Outbound email via the SMTP settings stored in app settings (Settings UI).
 * Ported from the Electron handler (src/main/handlers/email.ts). The transport
 * is built fresh per call so a settings change takes effect immediately.
 */
const nodemailer_1 = __importDefault(require("nodemailer"));
const store_1 = require("./store");
async function smtpConfig() {
    const s = (await (0, store_1.getSettings)()).smtp;
    return s;
}
async function makeTransport() {
    const smtp = await smtpConfig();
    if (!smtp.host || !smtp.user)
        return null;
    const transport = nodemailer_1.default.createTransport({
        host: smtp.host,
        port: Number(smtp.port) || 587,
        secure: !!smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass }
    });
    return { transport, smtp };
}
async function emailTest() {
    try {
        const t = await makeTransport();
        if (!t)
            return { ok: false, error: 'SMTP not configured (set host and username in Settings).' };
        await t.transport.verify();
        return { ok: true, data: { verified: true } };
    }
    catch (e) {
        return { ok: false, error: String(e) };
    }
}
async function emailSend(msg) {
    try {
        const to = String(msg.to ?? '').trim();
        const subject = String(msg.subject ?? '').trim();
        const html = String(msg.html ?? '');
        if (!to)
            return { ok: false, error: 'Recipient (to) is required' };
        if (!subject)
            return { ok: false, error: 'Subject is required' };
        if (!html)
            return { ok: false, error: 'Message body is required' };
        const t = await makeTransport();
        if (!t)
            return { ok: false, error: 'SMTP not configured (set host and username in Settings).' };
        const info = await t.transport.sendMail({ from: t.smtp.from || t.smtp.user, to, subject, html });
        return { ok: true, data: { messageId: info.messageId } };
    }
    catch (e) {
        return { ok: false, error: String(e) };
    }
}
//# sourceMappingURL=email.js.map