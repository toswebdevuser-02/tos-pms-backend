"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Add a member + their login in one step. Run:
 *   npm run add:member -- "Full Name" email@firm.com Role
 * Role is one of: Company Admin | Manager | Team Lead | Project Lead | Employee
 * Login password follows the standard formula: TOS@<first5ofFirstName><userId>
 * The new member can log in immediately (no forced reset).
 */
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("./prisma");
function makePassword(name, id) {
    const first = name.split(' ')[0].replace(/[^a-zA-Z]/g, '');
    return `TOS@${first.slice(0, 5)}${id}`;
}
async function main() {
    const [name, emailArg, ...roleParts] = process.argv.slice(2);
    if (!name || !emailArg)
        throw new Error('Usage: npm run add:member -- "Full Name" email@firm.com [Role]');
    const email = emailArg.trim().toLowerCase();
    const role = (roleParts.join(' ').trim() || 'Employee');
    // Don't create a duplicate if the email already exists.
    const existing = await prisma_1.prisma.member.findFirst({ where: { email } });
    if (existing)
        throw new Error(`A member with email ${email} already exists (id ${existing.id}).`);
    const member = await prisma_1.prisma.member.create({ data: { name, email, role, discipline: '' } });
    const password = makePassword(name, member.id);
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    await prisma_1.prisma.user.upsert({
        where: { email },
        create: { email, passwordHash, role, memberId: member.id, mustReset: false },
        update: { passwordHash, role, memberId: member.id, mustReset: false }
    });
    console.log('Member created and login provisioned:');
    console.log(`  Name:     ${name}`);
    console.log(`  Email:    ${email}`);
    console.log(`  Role:     ${role}`);
    console.log(`  Password: ${password}`);
}
main()
    .catch((e) => { console.error(String(e)); process.exit(1); })
    .finally(() => prisma_1.prisma.$disconnect());
//# sourceMappingURL=add-member.js.map