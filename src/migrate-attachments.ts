/**
 * One-time importer for attachment FILES (run after migrate-from-json).
 *   npm run migrate:attach
 *
 * The records already exist in Postgres with stored_path values that point into
 * the old desktop app's userData (e.g. "attachments\rfi\1\xyz.png"). This copies
 * each file into the server's STORAGE_DIR and rewrites stored_path to the new
 * server-relative form "<type>/<id>/<file>". Idempotent: skips files already in
 * the store.
 */
import fs from 'fs'
import path from 'path'
import { prisma } from './prisma'
import { env } from './env'

// userData dir = folder containing the legacy data.json
const legacyBase = path.dirname(path.resolve(env.legacyDataJson))

async function main(): Promise<void> {
  const atts = await prisma.attachment.findMany()
  let migrated = 0
  let skipped = 0
  let missing = 0
  for (const a of atts) {
    const normalized = a.storedPath.replace(/\\/g, '/')
    // Already in the server store?
    const inStore = path.join(env.storageDir, normalized)
    if (fs.existsSync(inStore)) { skipped++; continue }

    const src = path.join(legacyBase, a.storedPath)
    if (!fs.existsSync(src)) { console.warn(`  missing source for #${a.id}: ${src}`); missing++; continue }

    const newRel = path.posix.join(a.entityType, String(a.entityId), path.basename(normalized))
    const dest = path.join(env.storageDir, a.entityType, String(a.entityId), path.basename(normalized))
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
    await prisma.attachment.update({ where: { id: a.id }, data: { storedPath: newRel } })
    console.log(`  #${a.id} -> ${newRel}`)
    migrated++
  }
  console.log(`\nAttachments: migrated=${migrated} skipped=${skipped} missing=${missing} (from ${legacyBase})`)
}

main()
  .catch((e) => { console.error('Attachment migration failed:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
