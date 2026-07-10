/**
 * Server-side weekly digest: builds the same portfolio/risk summary the
 * Executive overview emails manually, and sends it on a schedule.
 *
 * The risk + HTML logic is ported verbatim from the frontend pure modules
 * (src/renderer/src/risk.ts and report.ts) so manual and automatic digests
 * match. Rows are built directly from the DB via the store.
 */
import * as projectService from './service/projectService'
import * as statusService from './service/statusService'
import * as itemService from './service/itemService'
import * as settingsService from './service/settingsService'
import { emailSend } from './email'

type Row = Record<string, unknown>
const num = (v: unknown): number => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? 0 : n }
const productiveOf = (r: Row): number => num(r.execution_hrs) + num(r.overtime_hrs)

// ── Risk (ported from src/renderer/src/risk.ts) ───────────────────────────────
type RiskLevel = 'Healthy' | 'Watch' | 'At-risk'
interface RiskInput {
  stage: string; endDate?: string; quotedHours: number; loggedHours: number
  tasks: { status?: unknown; deadline?: unknown; updated_at?: unknown }[]
  timesheets: { date?: unknown }[]; openItems: number; quietDays?: number
}
const today = (): Date => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
const parse = (v: unknown): Date | null => {
  const s = String(v ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00'); return isNaN(d.getTime()) ? null : d
}
const daysBetween = (a: Date, b: Date): number => Math.round((a.getTime() - b.getTime()) / 86400000)
const normStage = (s: string): 'On-going' | 'On-hold' | 'Completed' =>
  s === 'Completed' ? 'Completed' : (s === 'On-hold' || s === 'On Hold') ? 'On-hold' : 'On-going'

function assessRisk(i: RiskInput): { level: RiskLevel; score: number; reasons: string[] } {
  const stage = normStage(i.stage)
  if (stage === 'Completed') return { level: 'Healthy', score: 0, reasons: [] }
  const now = today(); const quietDays = i.quietDays ?? 7
  let score = 0; const reasons: string[] = []
  const add = (w: number, r: string): void => { score += w; reasons.push(r) }
  const end = parse(i.endDate)
  if (end) {
    const overdue = daysBetween(now, end)
    if (overdue > 0) add(2, `${overdue}d past target end date`)
    else if (overdue >= -3) add(1, 'Target end date within 3 days')
  }
  if (i.quotedHours > 0) {
    const used = i.loggedHours / i.quotedHours
    if (used > 1) add(2, `Over quoted hours (${Math.round(used * 100)}%)`)
    else if (used >= 0.9) add(1, `Near quoted hours (${Math.round(used * 100)}%)`)
  }
  if (stage === 'On-going') {
    const dates: number[] = []
    for (const t of i.timesheets) { const d = parse(t.date); if (d) dates.push(d.getTime()) }
    for (const t of i.tasks) { const d = parse(t.updated_at); if (d) dates.push(d.getTime()) }
    if (dates.length) {
      const idle = daysBetween(now, new Date(Math.max(...dates)))
      if (idle >= quietDays * 2) add(2, `No activity for ${idle} days`)
      else if (idle >= quietDays) add(1, `No activity for ${idle} days`)
    }
  }
  const overdueTasks = i.tasks.filter((t) => { const d = parse(t.deadline); return d && daysBetween(now, d) > 0 && t.status !== 'Done' }).length
  if (overdueTasks >= 3) add(2, `${overdueTasks} overdue tasks`)
  else if (overdueTasks >= 1) add(1, `${overdueTasks} overdue task${overdueTasks > 1 ? 's' : ''}`)
  if (i.openItems >= 5) add(1, `${i.openItems} open RFIs/queries`)
  return { level: score >= 3 ? 'At-risk' : score >= 1 ? 'Watch' : 'Healthy', score, reasons }
}

// ── Digest HTML (ported from src/renderer/src/report.ts) ──────────────────────
interface DigestRow { name: string; discipline: string; stage: string; level: RiskLevel; reasons: string[]; taskPct: number; logged: number; quoted: number }
const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c))
const RISK_HEX: Record<string, string> = { Healthy: '#16a34a', Watch: '#d97706', 'At-risk': '#dc2626' }

function buildDigestHtml(rows: DigestRow[]): string {
  const generated = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })
  const atRisk = rows.filter((r) => r.level === 'At-risk')
  const watch = rows.filter((r) => r.level === 'Watch')
  const healthy = rows.filter((r) => r.level === 'Healthy').length
  const row = (r: DigestRow): string => {
    const hex = RISK_HEX[r.level] ?? '#64748b'
    const used = r.quoted ? `${Math.round((r.logged / r.quoted) * 100)}% hrs` : ''
    return `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f8"><strong>${esc(r.name)}</strong>${r.discipline ? `<span style="color:#94a3b8"> · ${esc(r.discipline)}</span>` : ''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f8"><span style="color:${hex};font-weight:700">${esc(r.level)}</span></td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f8;color:#475569;font-size:12px">${esc(r.reasons.join(' · ') || '—')}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #eef2f8;color:#475569">${r.taskPct}%${used ? ` · ${used}` : ''}</td>
    </tr>`
  }
  const section = (title: string, list: DigestRow[], color: string): string => list.length
    ? `<h3 style="margin:18px 0 6px;color:${color};font-size:14px">${esc(title)} (${list.length})</h3>
       <table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>${list.map(row).join('')}</tbody></table>`
    : ''
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
  </div>`
}

// ── Build rows from the DB ────────────────────────────────────────────────────
export async function buildDigestRows(): Promise<DigestRow[]> {
  const projects = await projectService.getAll()
  const statuses = await statusService.getAll()
  const stageByPid = new Map<number, string>()
  statuses.forEach((s: any) => { if (s.overall) stageByPid.set(Number(s.project_id), String(s.overall)) })

  const rows: DigestRow[] = []
  for (const p of projects) {
    const pid = Number(p.id)
    const [tasks, ts, rfis, queries] = await Promise.all([
      itemService.getByProject(pid, 'task'), itemService.getByProject(pid, 'timesheet'),
      itemService.getByProject(pid, 'rfi'), itemService.getByProject(pid, 'query')
    ])
    const stage = stageByPid.get(pid) ?? 'On-going'
    if (normStage(stage) === 'Completed') continue // skip finished projects in the digest
    const done = tasks.filter((t: any) => t.status === 'Done').length
    const taskPct = tasks.length ? Math.round((done / tasks.length) * 100) : 0
    const logged = Math.round(ts.reduce((s: any, r: any) => s + productiveOf(r), 0) * 10) / 10
    const quoted = num(p.quoted_hours)
    const openItems = rfis.filter((r: any) => r.status === 'Open' || r.status === 'Pending').length +
                      queries.filter((q: any) => q.status === 'Open' || q.status === 'Pending').length
    const risk = assessRisk({ stage, endDate: String(p.end_date ?? ''), quotedHours: quoted, loggedHours: logged, tasks, timesheets: ts, openItems })
    rows.push({ name: String(p.name ?? ''), discipline: String(p.discipline ?? ''), stage, level: risk.level, reasons: risk.reasons, taskPct, logged, quoted })
  }
  // At-risk first, then watch, then healthy.
  const order: Record<RiskLevel, number> = { 'At-risk': 0, Watch: 1, Healthy: 2 }
  return rows.sort((a, b) => order[a.level] - order[b.level] || a.name.localeCompare(b.name))
}

interface DigestConfig { enabled?: boolean; frequency?: 'weekly' | 'daily'; dayOfWeek?: number; hour?: number; recipients?: string[]; lastSent?: string }

/** Called on a timer; sends the digest when the configured schedule is due. */
export async function runDigestTick(): Promise<void> {
  try {
    const settings = await settingsService.get()
    const d = (settings.digest ?? {}) as DigestConfig
    if (!d.enabled) return
    const recipients = (d.recipients ?? []).map((r: any) => String(r).trim()).filter(Boolean)
    if (!recipients.length) return
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    if (d.lastSent === todayStr) return                       // already sent today
    if (now.getHours() < (d.hour ?? 8)) return                // not yet the send hour
    if ((d.frequency ?? 'weekly') === 'weekly' && now.getDay() !== (d.dayOfWeek ?? 1)) return

    const rows = await buildDigestRows()
    const html = buildDigestHtml(rows)
    const subject = `Weekly Project Digest — ${now.toLocaleDateString()}`
    let sent = 0
    for (const to of recipients) { const r = await emailSend({ to, subject, html }); if (r.ok) sent++ }
    await settingsService.update({ digest: { ...d, lastSent: todayStr } })
    // eslint-disable-next-line no-console
    console.log(`[digest] sent to ${sent}/${recipients.length} recipient(s)`)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[digest] tick failed:', e)
  }
}
