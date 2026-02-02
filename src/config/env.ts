import dotenv from 'dotenv';

dotenv.config();

const corsOriginsRaw = process.env.CORS_ORIGIN ?? 'http://localhost:8080,http://localhost:4000';
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret === 'change-me') {
  throw new Error('JWT_SECRET is required and must not be "change-me"');
}

const corsOrigins = corsOriginsRaw
  .split(',')
  .map((v) => v.trim())
  .filter((v) => v.length > 0);

const nodeEnv = process.env.NODE_ENV ?? 'development';
if (nodeEnv === 'production') {
  if (!corsOrigins.length) {
    throw new Error('CORS_ORIGIN is required in production.');
  }
  if (corsOrigins.includes('*')) {
    throw new Error('CORS_ORIGIN must not include "*" in production.');
  }
  if (corsOrigins.includes('null')) {
    throw new Error('CORS_ORIGIN must not include "null" in production.');
  }
}

const jwtCookieSameSite = (process.env.JWT_COOKIE_SAMESITE ?? 'lax') as
  | 'lax'
  | 'strict'
  | 'none';
const jwtCookieSecure =
  process.env.JWT_COOKIE_SECURE !== undefined
    ? process.env.JWT_COOKIE_SECURE === 'true'
    : nodeEnv === 'production';

if (jwtCookieSameSite === 'none' && !jwtCookieSecure) {
  throw new Error('JWT_COOKIE_SECURE must be true when JWT_COOKIE_SAMESITE is "none".');
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT ?? 4000),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  jwtCookieName: process.env.JWT_COOKIE_NAME ?? 'auth_token',
  jwtCookieSameSite,
  jwtCookieSecure,
  corsOrigins,
  databaseUrlCead: process.env.DATABASE_URL_CEAD ?? '',
  databaseUrlBiblioteca: process.env.DATABASE_URL_BIBLIOTECA ?? '',
  storagePdfDir: process.env.STORAGE_PDF_DIR ?? 'storage/pdfs',
  storageCoverDir: process.env.STORAGE_COVER_DIR ?? 'storage/covers',
  logFormat: process.env.LOG_FORMAT ?? 'dev',
  pgPoolMax: Number(process.env.PG_POOL_MAX ?? 10),
  pgIdleTimeoutMs: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30000),
  pgConnTimeoutMs: Number(process.env.PG_CONN_TIMEOUT_MS ?? 5000)
};
