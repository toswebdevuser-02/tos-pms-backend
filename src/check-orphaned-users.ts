/**
 * Check for users without a linked member (NULL memberId).
 */
import { prisma } from './prisma'

async function main(): Promise<void> {
  // Find users with NULL memberId
  const orphaned = await prisma.user.findMany({
    where: { memberId: null },
    select: { id: true, email: true, role: true, memberId: true }
  })

  if (orphaned.length === 0) {
    console.log('✅ No orphaned users found. All users are linked to members.')
    return
  }

  console.log(`⚠️  Found ${orphaned.length} orphaned user(s) with NULL memberId:\n`)
  orphaned.forEach((u) => {
    console.log(`  ID: ${u.id}, Email: ${u.email}, Role: ${u.role}`)
  })

  // Try to auto-link them
  console.log('\nAttempting to auto-link orphaned users...\n')
  let linked = 0
  for (const user of orphaned) {
    const member = await prisma.member.findFirst({ where: { email: user.email } })
    if (member) {
      await prisma.user.update({
        where: { id: user.id },
        data: { memberId: member.id }
      })
      console.log(`  ✅ Linked ${user.email} to member ${member.id}`)
      linked++
    } else {
      console.log(`  ❌ No matching member found for ${user.email}`)
    }
  }
  console.log(`\nLinked: ${linked}/${orphaned.length}`)
}

main()
  .catch((e) => { console.error(String(e)); process.exit(1) })
  .finally(() => prisma.$disconnect())
