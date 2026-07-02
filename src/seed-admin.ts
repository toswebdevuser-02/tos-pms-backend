/**
 * Create (or reset) a Company Admin login. Run:
 *   npm run seed:admin -- admin@firm.com "Full Name" "TempPass123"
 * Args: <email> [name] [password]. If password omitted, a random one is printed.
 */
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

async function main(): Promise<void> {
  const [email, name, pwArg] = process.argv.slice(2)
  if (!email) throw new Error('Usage: npm run seed:admin -- <email> [name] [password]')
  const lower = email.trim().toLowerCase()
  const password = pwArg || crypto.randomBytes(6).toString('base64url')
  const passwordHash = await bcrypt.hash(password, 10)

  // Ensure a matching member exists (Company Admin role).
  let member = await prisma.member.findFirst({ where: { email: lower } })
  if (!member) {
    member = await prisma.member.create({
      data: { name: name || 'Company Admin', email: lower, role: 'Company Admin' }
    })
  }

  await prisma.user.upsert({
    where: { email: lower },
    create: { email: lower, passwordHash, role: 'Company Admin', memberId: member.id, mustReset: !pwArg },
    update: { passwordHash, role: 'Company Admin', memberId: member.id, mustReset: !pwArg }
  })

  console.log(`Company Admin ready: ${lower}`)
  console.log(`Password: ${password}${pwArg ? '' : '  (random — change after first login)'}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
