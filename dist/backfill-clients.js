"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * One-off backfill: turn each distinct project.client text into a Client record
 * (deduped case-insensitively) and link the project via clientId. Idempotent —
 * re-running reuses existing clients by name and only fills missing links.
 *
 *   npx tsx src/backfill-clients.ts
 */
const prisma_1 = require("./prisma");
async function nextCode() {
    const rows = await prisma_1.prisma.client.findMany({ select: { code: true } });
    let max = 0;
    for (const r of rows) {
        const m = String(r.code).match(/(\d+)\s*$/);
        if (m)
            max = Math.max(max, parseInt(m[1], 10));
    }
    return `CL-${String(max + 1).padStart(4, '0')}`;
}
async function main() {
    const projects = await prisma_1.prisma.project.findMany(); // include archived/soft-deleted
    // Group projects by case-insensitive client name; keep the first-seen casing.
    const byName = new Map();
    for (const p of projects) {
        const raw = String(p.client ?? '').trim();
        if (!raw)
            continue;
        const key = raw.toLowerCase();
        if (!byName.has(key))
            byName.set(key, { display: raw, ids: [] });
        byName.get(key).ids.push(p.id);
    }
    let created = 0, linked = 0, reused = 0;
    for (const { display, ids } of byName.values()) {
        let client = await prisma_1.prisma.client.findFirst({ where: { name: display } });
        if (!client) {
            client = await prisma_1.prisma.client.create({ data: { code: await nextCode(), name: display, createdBy: 'backfill', updatedBy: 'backfill' } });
            created++;
        }
        else {
            reused++;
        }
        const res = await prisma_1.prisma.project.updateMany({ where: { id: { in: ids }, clientId: null }, data: { clientId: client.id } });
        linked += res.count;
    }
    console.log(`Clients backfill complete: ${created} created, ${reused} reused, ${linked} project link(s) set, ${byName.size} distinct client name(s).`);
}
main()
    .then(async () => { await prisma_1.prisma.$disconnect(); process.exit(0); })
    .catch(async (e) => { console.error(e); await prisma_1.prisma.$disconnect(); process.exit(1); });
//# sourceMappingURL=backfill-clients.js.map