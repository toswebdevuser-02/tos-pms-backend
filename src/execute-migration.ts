/**
 * Execute the migration: make memberId NOT NULL and change cascade behavior.
 */
import { prisma } from './prisma'

async function main(): Promise<void> {
  try {
    // Execute the migration using raw SQL
    console.log('Applying migration...')
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "users" ALTER COLUMN "member_id" SET NOT NULL,
      DROP CONSTRAINT "users_member_id_fkey",
      ADD CONSTRAINT "users_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE
    `)
    console.log('✅ Migration applied successfully!')
  } catch (e) {
    console.error('❌ Error:', String(e))
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
