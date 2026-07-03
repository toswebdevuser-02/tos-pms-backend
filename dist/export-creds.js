"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Export all user logins to an Excel (.xlsx) on the Desktop. READ-ONLY — never
 * modifies the database. Password = verified formula TOS@<first5ofFirstName><userId>,
 * bcrypt-checked against the DB. The admin shows TOS@2026. Any account whose
 * password no longer matches the formula (the user changed it themselves) is left
 * untouched and its Password cell is blank with a Note.
 * Usage: cd server && npx tsx src/export-creds.ts
 */
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const exceljs_1 = __importDefault(require("exceljs"));
const prisma_1 = require("./prisma");
const ADMIN_EMAIL = 'it@teslaoutsourcingservices.com';
const ADMIN_PW = 'TOS@2026';
function makePassword(name, id) {
    const first = name.split(' ')[0].replace(/[^a-zA-Z]/g, '');
    return `TOS@${first.slice(0, 5)}${id}`;
}
async function main() {
    const users = await prisma_1.prisma.user.findMany({ include: { member: true }, orderBy: { id: 'asc' } });
    const rows = [];
    const changed = [];
    for (const u of users) {
        const name = u.member?.name ?? u.email;
        let password = '';
        let note = '';
        if (u.email.toLowerCase() === ADMIN_EMAIL) {
            password = (await bcryptjs_1.default.compare(ADMIN_PW, u.passwordHash)) ? ADMIN_PW : '';
            if (!password)
                note = 'admin password changed — not the default';
        }
        else {
            const formula = makePassword(name, u.id);
            if (await bcryptjs_1.default.compare(formula, u.passwordHash)) {
                password = formula;
            }
            else {
                // User changed their own password — leave it alone; do NOT reset.
                password = '';
                note = 'user changed their password — not in this list';
                changed.push(`${name} <${u.email}>`);
            }
        }
        rows.push({ name, email: u.email, role: u.member?.role ?? u.role, password, note });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    const wb = new exceljs_1.default.Workbook();
    const ws = wb.addWorksheet('Logins');
    ws.columns = [
        { header: '#', key: 'i', width: 5 },
        { header: 'Name', key: 'name', width: 28 },
        { header: 'Email', key: 'email', width: 38 },
        { header: 'Role', key: 'role', width: 14 },
        { header: 'Password', key: 'password', width: 18 },
        { header: 'Note', key: 'note', width: 30 }
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    rows.forEach((r, idx) => ws.addRow({ i: idx + 1, name: r.name, email: r.email, role: r.role, password: r.password, note: r.note }));
    ws.autoFilter = 'A1:F1';
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    let dir = path_1.default.join(os_1.default.homedir(), 'Desktop');
    if (!fs_1.default.existsSync(dir))
        dir = path_1.default.join(os_1.default.homedir(), 'OneDrive', 'Desktop');
    if (!fs_1.default.existsSync(dir))
        dir = os_1.default.homedir();
    const stamp = new Date().toISOString().slice(0, 10);
    const outPath = path_1.default.join(dir, `TOS_Tracker_Logins_${stamp}.xlsx`);
    await wb.xlsx.writeFile(outPath);
    console.log(`\nWrote ${rows.length} logins to:\n  ${outPath}`);
    if (changed.length) {
        console.log(`\n${changed.length} account(s) changed their own password (blank in the sheet, left untouched):`);
        changed.forEach((r) => console.log('  -', r));
    }
}
main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma_1.prisma.$disconnect());
//# sourceMappingURL=export-creds.js.map