/**
 * List every user with their verified login password.
 * Recomputes the formula password (TOS@<first5ofname><userId>) and bcrypt-checks
 * it against the stored hash so the printed list is guaranteed correct.
 * Usage: npx tsx src/list-creds.ts
 */
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

function makePassword(name: string, id: number): string {
  const first = name.split(' ')[0].replace(/[^a-zA-Z]/g, '')
  return `TOS@${first.slice(0, 5)}${id}`
}

async function main(): Promise<void> {
  const users = await prisma.user.findMany({ include: { member: true }, orderBy: { id: 'asc' } })
  const good: string[] = []
  const mismatched: string[] = []
  for (const u of users) {
    const name = u.member?.name ?? u.email
    const pw = makePassword(name, u.id)
    const match = await bcrypt.compare(pw, u.passwordHash)
    if (match) good.push(`${u.email}\t${pw}`)
    else mismatched.push(`id=${u.id}\t${u.email}\t(${name})`)
  }
  console.log(`=== ${good.length} users with verified formula passwords ===`)
  console.log('EMAIL\tPASSWORD')
  good.forEach((l) => console.log(l))
  console.log(`\n=== ${mismatched.length} users whose password is NOT the formula (changed it, or admin) ===`)
  mismatched.forEach((l) => console.log(l))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
