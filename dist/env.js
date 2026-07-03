"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
function required(name, fallback) {
    const v = process.env[name] ?? fallback;
    if (v === undefined) {
        throw new Error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`);
    }
    return v;
}
exports.env = {
    databaseUrl: required('DATABASE_URL', ''),
    jwtSecret: required('JWT_SECRET', 'dev-insecure-secret-change-me'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
    port: parseInt(process.env.PORT ?? '4000', 10),
    storageDir: path_1.default.resolve(process.env.STORAGE_DIR ?? './storage/attachments'),
    legacyDataJson: process.env.LEGACY_DATA_JSON ?? '../../data.json'
};
//# sourceMappingURL=env.js.map