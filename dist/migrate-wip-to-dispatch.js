"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * One-off: merge WIP items into Dispatch (the two features were combined into a
 * single scheduled-dispatch tab). Each WIP row becomes a dispatch row with mapped
 * fields, then the WIP row is deleted. Idempotent — re-running finds no WIP rows.
 *
 *   npx tsx src/migrate-wip-to-dispatch.ts
 */
const prisma_1 = require("./prisma");
const STATUS_MAP = {
    'Not Started': 'Scheduled', 'In Progress': 'In Progress', Achieved: 'Dispatched',
    Postponed: 'Hold', Hold: 'Hold', Done: 'Dispatched'
};
async function main() {
    const wips = await prisma_1.prisma.wipTask.findMany();
    let moved = 0;
    for (const w of wips) {
        const d = (w.data ?? {});
        const status = STATUS_MAP[String(d.status ?? '')] ?? 'Scheduled';
        const data = {
            dispatch_number: '',
            description: String(d.task_name ?? d.description ?? 'WIP item'),
            assigned_member_id: d.assigned_member_id ?? '',
            recipient: '',
            dispatch_date: String(d.planned_date ?? d.due_date ?? ''),
            status,
            origin: 'wip'
        };
        await prisma_1.prisma.dispatch.create({ data: { projectId: w.projectId, data, createdBy: w.createdBy || 'wip-merge', updatedBy: 'wip-merge' } });
        await prisma_1.prisma.wipTask.delete({ where: { id: w.id } });
        moved++;
    }
    console.log(`WIP → Dispatch merge complete: ${moved} item(s) moved.`);
}
main().then(async () => { await prisma_1.prisma.$disconnect(); process.exit(0); }).catch(async (e) => { console.error(e); await prisma_1.prisma.$disconnect(); process.exit(1); });
//# sourceMappingURL=migrate-wip-to-dispatch.js.map