/**
 * Reset ONE user's password to the standard formula (TOS@<first5ofName><userId>).
 * Unlike gen-passwords.ts (bulk, mustReset-only), this targets a single email and
 * never touches role/mustReset — safe to run on an account that already logged in.
 * Usage: npx tsx src/reset-password.ts <email>
 */
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

function makePassword(name: string, id: number): string {
  const first = name.split(' ')[0].replace(/[^a-zA-Z]/g, '')
  return `TOS@${first.slice(0, 5)}${id}`
}

async function main(): Promise<void> {
  const email = process.argv[2]
  if (!email) throw new Error('Usage: npx tsx src/reset-password.ts <email>')
  const lower = email.trim().toLowerCase()

  const user = await prisma.user.findUnique({ where: { email: lower }, include: { member: true } })
  if (!user) throw new Error(`No user found with email ${lower}`)

  const name = user.member?.name ?? user.email
  const password = makePassword(name, user.id)
  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

  console.log(`Reset password for ${user.email} (${name}, id=${user.id})`)
  console.log(`New password: ${password}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
