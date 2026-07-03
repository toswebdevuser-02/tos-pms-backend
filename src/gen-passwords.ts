/**
 * Generate unique passwords for all mustReset users, set mustReset=false.
 * Password format: TOS@<first4ofname><userId>  e.g. TOS@Hard7
 * Prints a full credentials table for distribution.
 * Usage: npx tsx src/gen-passwords.ts
 */
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

function makePassword(name: string, id: number): string {
  const first = name.split(' ')[0].replace(/[^a-zA-Z]/g, '')
  const prefix = first.slice(0, 5)
  return `TOS@${prefix}${id}`
}

async function main(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { mustReset: true },
    include: { member: true },
    orderBy: { id: 'asc' }
  })

  if (users.length === 0) {
    console.log('No mustReset users found.')
    return
  }

  console.log(`Generating passwords for ${users.length} users...\n`)
  console.log('EMAIL'.padEnd(45), 'NAME'.padEnd(35), 'PASSWORD')
  console.log('-'.repeat(100))

  for (const u of users) {
    const displayName = u.member?.name ?? u.email
    const pw = makePassword(displayName, u.id)
    const hash = await bcrypt.hash(pw, 10)
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: hash, mustReset: false } })
    console.log(u.email.padEnd(45), displayName.padEnd(35), pw)
  }

  console.log('\nDone. All users can now log in directly without a forced password change.')
  console.log('They can change their password anytime via the "Change Password" button in the app.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
