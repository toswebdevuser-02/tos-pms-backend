/**
 * Export all user logins to an Excel (.xlsx) on the Desktop. READ-ONLY — never
 * modifies the database. Password = verified formula TOS@<first5ofFirstName><userId>,
 * bcrypt-checked against the DB. The admin shows TOS@2026. Any account whose
 * password no longer matches the formula (the user changed it themselves) is left
 * untouched and its Password cell is blank with a Note.
 * Usage: cd server && npx tsx src/export-creds.ts
 */
import os from 'os'
import path from 'path'
import fs from 'fs'
import bcrypt from 'bcryptjs'
import ExcelJS from 'exceljs'
import { prisma } from './prisma'

const ADMIN_EMAIL = 'it@teslaoutsourcingservices.com'
const ADMIN_PW = 'TOS@2026'

function makePassword(name: string, id: number): string {
  const first = name.split(' ')[0].replace(/[^a-zA-Z]/g, '')
  return `TOS@${first.slice(0, 5)}${id}`
}

async function main(): Promise<void> {
  const users = await prisma.user.findMany({ include: { member: true }, orderBy: { id: 'asc' } })

  type Row = { name: string; email: string; role: string; password: string; note: string }
  const rows: Row[] = []
  const changed: string[] = []

  for (const u of users) {
    const name = u.member?.name ?? u.email
    let password = ''
    let note = ''

    if (u.email.toLowerCase() === ADMIN_EMAIL) {
      password = (await bcrypt.compare(ADMIN_PW, u.passwordHash)) ? ADMIN_PW : ''
      if (!password) note = 'admin password changed — not the default'
    } else {
      const formula = makePassword(name, u.id)
      if (await bcrypt.compare(formula, u.passwordHash)) {
        password = formula
      } else {
        // User changed their own password — leave it alone; do NOT reset.
        password = ''
        note = 'user changed their password — not in this list'
        changed.push(`${name} <${u.email}>`)
      }
    }
    rows.push({ name, email: u.email, role: u.member?.role ?? u.role, password, note })
  }

  rows.sort((a, b) => a.name.localeCompare(b.name))

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Logins')
  ws.columns = [
    { header: '#', key: 'i', width: 5 },
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Email', key: 'email', width: 38 },
    { header: 'Role', key: 'role', width: 14 },
    { header: 'Password', key: 'password', width: 18 },
    { header: 'Note', key: 'note', width: 30 }
  ]
  ws.getRow(1).font = { bold: true }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  rows.forEach((r, idx) => ws.addRow({ i: idx + 1, name: r.name, email: r.email, role: r.role, password: r.password, note: r.note }))
  ws.autoFilter = 'A1:F1'
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  let dir = path.join(os.homedir(), 'Desktop')
  if (!fs.existsSync(dir)) dir = path.join(os.homedir(), 'OneDrive', 'Desktop')
  if (!fs.existsSync(dir)) dir = os.homedir()
  const stamp = new Date().toISOString().slice(0, 10)
  const outPath = path.join(dir, `TOS_Tracker_Logins_${stamp}.xlsx`)
  await wb.xlsx.writeFile(outPath)

  console.log(`\nWrote ${rows.length} logins to:\n  ${outPath}`)
  if (changed.length) {
    console.log(`\n${changed.length} account(s) changed their own password (blank in the sheet, left untouched):`)
    changed.forEach((r) => console.log('  -', r))
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
