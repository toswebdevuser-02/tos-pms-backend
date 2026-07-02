/**
 * One-time importer: legacy data.json  ->  PostgreSQL.
 *
 * Run with:  npm run migrate:json
 * Reads the path in env.legacyDataJson (LEGACY_DATA_JSON in .env).
 *
 * - Preserves original ids for every row.
 * - Reseeds Postgres autoincrement sequences past the imported max id.
 * - Moves SMTP settings into the app_settings row.
 * - Creates a `users` login row for every member with a random temp password
 *   (printed at the end) and must_reset = true.
 *
 * Safe to re-run only against an EMPTY database — it will fail on duplicate ids
 * otherwise, which is intentional (don't silently double-import).
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { env } from './env'

type Row = Record<string, unknown>

function parseDate(v: unknown): Date {
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v.replace(' ', 'T'))
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

// Build { projectId, data } from a legacy item row, stripping reserved keys.
const RESERVED = new Set(['id', 'project_id', 'created_at', 'created_by', 'updated_by', 'version'])
function itemColumns(r: Row): { id: number; projectId: number; data: Row; createdAt: Date; createdBy: string; updatedBy: string } {
  const data: Row = {}
  for (const [k, v] of Object.entries(r)) if (!RESERVED.has(k)) data[k] = v
  return {
    id: Number(r.id),
    projectId: Number(r.project_id),
    data,
    createdAt: parseDate(r.created_at),
    createdBy: String(r.created_by ?? ''),
    updatedBy: String(r.updated_by ?? '')
  }
}

const ITEM_TABLES: Record<string, string> = {
  rfis: 'rfi', queries: 'query', dispatches: 'dispatch', wip_tasks: 'wipTask',
  qc_items: 'qcItem', timesheets: 'timesheet', tasks: 'task', standards: 'standard',
  scopes: 'scope', meetings: 'meeting', inputs: 'input'
}

async function reseed(table: string): Promise<void> {
  // Push the sequence to MAX(id) so future inserts don't collide.
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${table}"), 1))`
  )
}

async function main(): Promise<void> {
  const jsonPath = path.resolve(env.legacyDataJson)
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Legacy data file not found at ${jsonPath}. Set LEGACY_DATA_JSON in .env.`)
  }
  const store = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Record<string, unknown>
  const arr = (k: string): Row[] => (Array.isArray(store[k]) ? (store[k] as Row[]) : [])

  console.log(`Importing from ${jsonPath} ...`)

  // Members
  const members = arr('members')
  if (members.length) {
    await prisma.member.createMany({
      data: members.map((m) => ({
        id: Number(m.id), name: String(m.name ?? ''), email: String(m.email ?? ''),
        role: String(m.role ?? 'Member'), createdAt: parseDate(m.created_at)
      }))
    })
  }

  // Projects
  const projects = arr('projects')
  if (projects.length) {
    await prisma.project.createMany({
      data: projects.map((p) => ({
        id: Number(p.id), name: String(p.name ?? ''), client: String(p.client ?? ''),
        location: String(p.location ?? ''), discipline: String(p.discipline ?? ''),
        quotedHours: Number(p.quoted_hours ?? 0),
        createdAt: parseDate(p.created_at), updatedAt: parseDate(p.updated_at ?? p.created_at),
        createdBy: String(p.created_by ?? ''), updatedBy: String(p.updated_by ?? '')
      }))
    })
  }

  // Project ↔ member assignments
  const pm = arr('project_members')
  if (pm.length) {
    await prisma.projectMember.createMany({
      data: pm.map((r) => ({ id: Number(r.id), projectId: Number(r.project_id), memberId: Number(r.member_id) })),
      skipDuplicates: true
    })
  }

  // Project status (singleton per project)
  const statuses = arr('project_status')
  if (statuses.length) {
    await prisma.projectStatus.createMany({
      data: statuses.map((s) => ({
        id: Number(s.id), projectId: Number(s.project_id),
        overall: String(s.overall ?? ''), notes: String(s.notes ?? ''),
        lastUpdated: parseDate(s.last_updated), createdBy: String(s.created_by ?? ''), updatedBy: String(s.updated_by ?? '')
      })),
      skipDuplicates: true
    })
  }

  // Generic item tables
  for (const [jsonKey, delegateName] of Object.entries(ITEM_TABLES)) {
    const rows = arr(jsonKey)
    if (!rows.length) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[delegateName]
    await delegate.createMany({ data: rows.map(itemColumns) })
    console.log(`  ${jsonKey}: ${rows.length}`)
  }

  // Attachments
  const atts = arr('attachments')
  if (atts.length) {
    await prisma.attachment.createMany({
      data: atts.map((a) => ({
        id: Number(a.id), entityType: String(a.entity_type), entityId: Number(a.entity_id),
        filename: String(a.filename ?? ''), storedPath: String(a.stored_path ?? ''),
        description: String(a.description ?? ''), response: String(a.response ?? ''),
        importance: String(a.importance ?? 'Medium'), createdAt: parseDate(a.created_at)
      }))
    })
  }

  // Settings (SMTP etc.)
  const settings = (store.settings ?? {}) as Row
  await prisma.appSetting.upsert({
    where: { id: 1 },
    create: { id: 1, data: { smtp: settings.smtp ?? {} } },
    update: { data: { smtp: settings.smtp ?? {} } }
  })

  // Reseed every sequence
  const allTables = ['members', 'projects', 'project_members', 'project_status', 'attachments',
    'rfis', 'queries', 'dispatches', 'wip_tasks', 'qc_items', 'timesheets', 'tasks',
    'standards', 'scopes', 'meetings', 'inputs', 'users']
  for (const t of allTables) await reseed(t)

  // Create login users for each member with a random temp password.
  const creds: { email: string; tempPassword: string }[] = []
  for (const m of members) {
    const email = String(m.email ?? '').trim().toLowerCase()
    if (!email) continue
    const temp = crypto.randomBytes(6).toString('base64url') // ~8 chars
    const passwordHash = await bcrypt.hash(temp, 10)
    await prisma.user.create({
      data: { email, passwordHash, role: String(m.role ?? 'Member'), memberId: Number(m.id), mustReset: true }
    })
    creds.push({ email, tempPassword: temp })
  }
  await reseed('users')

  console.log('\nMigration complete. Counts:')
  console.log(`  members=${members.length} projects=${projects.length} attachments=${atts.length}`)
  if (creds.length) {
    console.log('\nTemporary login passwords (share securely; users reset on first login):')
    for (const c of creds) console.log(`  ${c.email.padEnd(36)} ${c.tempPassword}`)
  } else {
    console.log('\nNo member emails found — create the first admin with `npm run seed:admin`.')
  }
}

main()
  .catch((e) => { console.error('Migration failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
