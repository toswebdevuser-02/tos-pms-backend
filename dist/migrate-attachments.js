"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("./prisma");
const env_1 = require("./env");
// userData dir = folder containing the legacy data.json
const legacyBase = path_1.default.dirname(path_1.default.resolve(env_1.env.legacyDataJson));
async function main() {
    const atts = await prisma_1.prisma.attachment.findMany();
    let migrated = 0;
    let skipped = 0;
    let missing = 0;
    for (const a of atts) {
        const normalized = a.storedPath.replace(/\\/g, '/');
        // Already in the server store?
        const inStore = path_1.default.join(env_1.env.storageDir, normalized);
        if (fs_1.default.existsSync(inStore)) {
            skipped++;
            continue;
        }
        const src = path_1.default.join(legacyBase, a.storedPath);
        if (!fs_1.default.existsSync(src)) {
            console.warn(`  missing source for #${a.id}: ${src}`);
            missing++;
            continue;
        }
        const newRel = path_1.default.posix.join(a.entityType, String(a.entityId), path_1.default.basename(normalized));
        const dest = path_1.default.join(env_1.env.storageDir, a.entityType, String(a.entityId), path_1.default.basename(normalized));
        fs_1.default.mkdirSync(path_1.default.dirname(dest), { recursive: true });
        fs_1.default.copyFileSync(src, dest);
        await prisma_1.prisma.attachment.update({ where: { id: a.id }, data: { storedPath: newRel } });
        console.log(`  #${a.id} -> ${newRel}`);
        migrated++;
    }
    console.log(`\nAttachments: migrated=${migrated} skipped=${skipped} missing=${missing} (from ${legacyBase})`);
}
main()
    .catch((e) => { console.error('Attachment migration failed:', e); process.exit(1); })
    .finally(() => prisma_1.prisma.$disconnect());
//# sourceMappingURL=migrate-attachments.js.map