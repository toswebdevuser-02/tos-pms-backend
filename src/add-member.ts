/**
 * Add a member + their login in one step. Run:
 *   npm run add:member -- "Full Name" email@firm.com Role
 * Role is one of: Company Admin | Manager | Team Lead | Project Lead | Employee
 * Login password follows the standard formula: TOS@<first5ofFirstName><userId>
 * The new member can log in immediately (no forced reset).
 */
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

function makePassword(name: string, id: number): string {
  const first = name.split(' ')[0].replace(/[^a-zA-Z]/g, '')
  return `TOS@${first.slice(0, 5)}${id}`
}

async function main(): Promise<void> {
  const [name, emailArg, ...roleParts] = process.argv.slice(2)
  if (!name || !emailArg) throw new Error('Usage: npm run add:member -- "Full Name" email@firm.com [Role]')
  const email = emailArg.trim().toLowerCase()
  const role = (roleParts.join(' ').trim() || 'Employee')

  // Don't create a duplicate if the email already exists.
  const existing = await prisma.member.findFirst({ where: { email } })
  if (existing) throw new Error(`A member with email ${email} already exists (id ${existing.id}).`)

  const member = await prisma.member.create({ data: { name, email, role, discipline: '' } })
  const password = makePassword(name, member.id)
  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, role, memberId: member.id, mustReset: false },
    update: { passwordHash, role, memberId: member.id, mustReset: false }
  })

  console.log('Member created and login provisioned:')
  console.log(`  Name:     ${name}`)
  console.log(`  Email:    ${email}`)
  console.log(`  Role:     ${role}`)
  console.log(`  Password: ${password}`)
}

main()
  .catch((e) => { console.error(String(e)); process.exit(1) })
  .finally(() => prisma.$disconnect())
