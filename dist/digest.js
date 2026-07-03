"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDigestRows = buildDigestRows;
exports.runDigestTick = runDigestTick;
/**
 * Server-side weekly digest: builds the same portfolio/risk summary the
 * Executive overview emails manually, and sends it on a schedule.
 *
 * The risk + HTML logic is ported verbatim from the frontend pure modules
 * (src/renderer/src/risk.ts and report.ts) so manual and automatic digests
 * match. Rows are built directly from the DB via the store.
 */
const store_1 = require("./store");
const email_1 = require("./email");
const num = (v) => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? 0 : n; };
const productiveOf = (r) => num(r.execution_hrs) + num(r.overtime_hrs);
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const parse = (v) => {
    const s = String(v ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
        return null;
    const d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
};
const daysBetween = (a, b) => Math.round((a.getTime() - b.getTime()) / 86400000);
const normStage = (s) => s === 'Completed' ? 'Completed' : (s === 'On-hold' || s === 'On Hold') ? 'On-hold' : 'On-going';
function assessRisk(i) {
    const stage = normStage(i.stage);
    if (stage === 'Completed')
        return { level: 'Healthy', score: 0, reasons: [] };
    const now = today();
    const quietDays = i.quietDays ?? 7;
    let score = 0;
    const reasons = [];
    const add = (w, r) => { score += w; reasons.push(r); };
    const end = parse(i.endDate);
    if (end) {
        const overdue = daysBetween(now, end);
        if (overdue > 0)
            add(2, `${overdue}d past target end date`);
        else if (overdue >= -3)
            add(1, 'Target end date within 3 days');
    }
    if (i.quotedHours > 0) {
        const used = i.loggedHours / i.quotedHours;
        if (used > 1)
            add(2, `Over quoted hours (${Math.round(used * 100)}%)`);
        else if (used >= 0.9)
            add(1, `Near quoted hours (${Math.round(used * 100)}%)`);
    }
    if (stage === 'On-going') {
        const dates = [];
        for (const t of i.timesheets) {
            const d = parse(t.date);
            if (d)
                dates.push(d.getTime());
        }
        for (const t of i.tasks) {
            const d = parse(t.updated_at);
            if (d)
                dates.push(d.getTime());
        }
        if (dates.length) {
            const idle = daysBetween(now, new Date(Math.max(...dates)));
            if (idle >= quietDays * 2)
                add(2, `No activity for ${idle} days`);
            else if (idle >= quietDays)
                add(1, `No activity for ${idle} days`);
        }
    }
    const overdueTasks = i.tasks.filter((t) => { const d = parse(t.deadline); return d && daysBetween(now, d) > 0 && t.status !== 'Done'; }).length;
    if (overdueTasks >= 3)
        add(2, `${overdueTasks} overdue tasks`);
    else if (overdueTasks >= 1)
        add(1, `${overdueTasks} overdue task${overdueTasks > 1 ? 's' : ''}`);
    if (i.openItems >= 5)
        add(1, `${i.openItems} open RFIs/queries`);
    return { level: score >= 3 ? 'At-risk' : score >= 1 ? 'Watch' : 'Healthy', score, reasons };
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
const RISK_HEX = { Healthy: '#16a34a', Watch: '#d97706', 'At-risk': '#dc2626' };
function buildDigestHtml(rows) {
    const generated = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
    const atRisk = rows.filter((r) => r.level === 'At-risk');
    const watch = rows.filter((r) => r.level === 'Watch');
    const healthy = rows.filter((r) => r.level === 'Healthy').length;
    const row = (r) => {
        const hex = RISK_HEX[r.level] ?? '#64748b';
        const used = r.quoted ? `${Math.round((r.logged / r.quoted) * 100)}% hrs` : '';
        return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f8"><strong>${esc(r.name)}</strong>${r.discipline ? `<span style="color:#94a3b8"> · ${esc(r.discipline)}</span>` : ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f8"><span style="color:${hex};font-weight:700">${esc(r.level)}</span></td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f8;color:#475569;font-size:12px">${esc(r.reasons.join(' · ') || '—')}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f8;color:#475569">${r.taskPct}%${used ? ` · ${used}` : ''}</td>
    </tr>`;
    };
    const section = (title, list, color) => list.length
        ? `<h3 style="margin:18px 0 6px;color:${color};font-size:14px">${esc(title)} (${list.length})</h3>
       <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${list.map(row).join('')}</tbody></table>`
        : '';
    return `<div style="font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#0f172a;max-width:680px;margin:0 auto">
    <div style="border-bottom:3px solid #2563eb;padding-bottom:10px;margin-bottom:8px">
      <div style="font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#64748b;font-weight:700">Tesla Outsourcing Services</div>
      <h2 style="margin:4px 0 2px;font-size:20px">Weekly Project Digest</h2>
      <div style="color:#94a3b8;font-size:12px">${esc(generated)}</div>
    </div>
    <p style="color:#475569">${rows.length} projects · <strong style="color:#dc2626">${atRisk.length} at-risk</strong> · <strong style="color:#d97706">${watch.length} watch</strong> · <span style="color:#16a34a">${healthy} healthy</span></p>
    ${section('At-risk', atRisk, '#dc2626')}
    ${section('Needs watching', watch, '#d97706')}
    ${atRisk.length === 0 && watch.length === 0 ? '<p style="color:#16a34a;font-weight:600">All projects are healthy. 👍</p>' : ''}
    <p style="margin-top:24px;color:#94a3b8;font-size:11px">Sent automatically from TOS Tracker · Tesla Outsourcing Services</p>
  </div>`;
}
// ── Build rows from the DB ────────────────────────────────────────────────────
async function buildDigestRows() {
    const projects = await (0, store_1.projectsGetAll)();
    const statuses = await (0, store_1.statusesGetAll)();
    const stageByPid = new Map();
    statuses.forEach((s) => { if (s.overall)
        stageByPid.set(Number(s.project_id), String(s.overall)); });
    const rows = [];
    for (const p of projects) {
        const pid = Number(p.id);
        const [tasks, ts, rfis, queries] = await Promise.all([
            (0, store_1.itemsGetByProject)(pid, 'task'), (0, store_1.itemsGetByProject)(pid, 'timesheet'),
            (0, store_1.itemsGetByProject)(pid, 'rfi'), (0, store_1.itemsGetByProject)(pid, 'query')
        ]);
        const stage = stageByPid.get(pid) ?? 'On-going';
        if (normStage(stage) === 'Completed')
            continue; // skip finished projects in the digest
        const done = tasks.filter((t) => t.status === 'Done').length;
        const taskPct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
        const logged = Math.round(ts.reduce((s, r) => s + productiveOf(r), 0) * 10) / 10;
        const quoted = num(p.quoted_hours);
        const openItems = rfis.filter((r) => r.status === 'Open' || r.status === 'Pending').length +
            queries.filter((q) => q.status === 'Open' || q.status === 'Pending').length;
        const risk = assessRisk({ stage, endDate: String(p.end_date ?? ''), quotedHours: quoted, loggedHours: logged, tasks, timesheets: ts, openItems });
        rows.push({ name: String(p.name ?? ''), discipline: String(p.discipline ?? ''), stage, level: risk.level, reasons: risk.reasons, taskPct, logged, quoted });
    }
    // At-risk first, then watch, then healthy.
    const order = { 'At-risk': 0, Watch: 1, Healthy: 2 };
    return rows.sort((a, b) => order[a.level] - order[b.level] || a.name.localeCompare(b.name));
}
/** Called on a timer; sends the digest when the configured schedule is due. */
async function runDigestTick() {
    try {
        const settings = await (0, store_1.getSettings)();
        const d = (settings.digest ?? {});
        if (!d.enabled)
            return;
        const recipients = (d.recipients ?? []).map((r) => String(r).trim()).filter(Boolean);
        if (!recipients.length)
            return;
        const now = new Date();
        const todayStr = now.toISOString().slice(0, 10);
        if (d.lastSent === todayStr)
            return; // already sent today
        if (now.getHours() < (d.hour ?? 8))
            return; // not yet the send hour
        if ((d.frequency ?? 'weekly') === 'weekly' && now.getDay() !== (d.dayOfWeek ?? 1))
            return;
        const rows = await buildDigestRows();
        const html = buildDigestHtml(rows);
        const subject = `Weekly Project Digest — ${now.toLocaleDateString()}`;
        let sent = 0;
        for (const to of recipients) {
            const r = await (0, email_1.emailSend)({ to, subject, html });
            if (r.ok)
                sent++;
        }
        await (0, store_1.updateSettings)({ digest: { ...d, lastSent: todayStr } });
        // eslint-disable-next-line no-console
        console.log(`[digest] sent to ${sent}/${recipients.length} recipient(s)`);
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error('[digest] tick failed:', e);
    }
}
//# sourceMappingURL=digest.js.map