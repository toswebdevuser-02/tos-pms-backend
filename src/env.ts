import dotenv from 'dotenv'
import path from 'path'

dotenv.config()

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (v === undefined) {
    throw new Error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`)
  }
  return v
}

export const env = {
  databaseUrl: required('DATABASE_URL', ''),
  jwtSecret: required('JWT_SECRET', 'dev-insecure-secret-change-me'),
  refreshSecret: required('REFRESH_SECRET', 'dev-insecure-refresh-secret-change-me'), // NEW — separate secret
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN ?? '15m',   // NEW
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN ?? '30d', // NEW
  port: parseInt(process.env.PORT ?? '4000', 10),
  storageDir: path.resolve(process.env.STORAGE_DIR ?? './storage/attachments'),
  legacyDataJson: process.env.LEGACY_DATA_JSON ?? '../../data.json'
}
