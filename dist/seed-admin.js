"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Create (or reset) a Company Admin login. Run:
 *   npm run seed:admin -- admin@firm.com "Full Name" "TempPass123"
 * Args: <email> [name] [password]. If password omitted, a random one is printed.
 */
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("./prisma");
async function main() {
    const [email, name, pwArg] = process.argv.slice(2);
    if (!email)
        throw new Error('Usage: npm run seed:admin -- <email> [name] [password]');
    const lower = email.trim().toLowerCase();
    const password = pwArg || crypto_1.default.randomBytes(6).toString('base64url');
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    // Ensure a matching member exists (Company Admin role).
    let member = await prisma_1.prisma.member.findFirst({ where: { email: lower } });
    if (!member) {
        member = await prisma_1.prisma.member.create({
            data: { name: name || 'Company Admin', email: lower, role: 'Company Admin' }
        });
    }
    await prisma_1.prisma.user.upsert({
        where: { email: lower },
        create: { email: lower, passwordHash, role: 'Company Admin', memberId: member.id, mustReset: !pwArg },
        update: { passwordHash, role: 'Company Admin', memberId: member.id, mustReset: !pwArg }
    });
    console.log(`Company Admin ready: ${lower}`);
    console.log(`Password: ${password}${pwArg ? '' : '  (random — change after first login)'}`);
}
main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma_1.prisma.$disconnect());
//# sourceMappingURL=seed-admin.js.map