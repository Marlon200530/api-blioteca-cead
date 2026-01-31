import dotenv from 'dotenv';

dotenv.config();

const corsOriginsRaw = process.env.CORS_ORIGIN ?? 'http://localhost:8080,http://localhost:4000';
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret || jwtSecret === 'change-me') {
  throw new Error('JWT_SECRET is required and must not be "change-me"');
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigins: corsOriginsRaw.split(',').map((v) => v.trim()),
  databaseUrlCead: process.env.DATABASE_URL_CEAD ?? '',
  databaseUrlBiblioteca: process.env.DATABASE_URL_BIBLIOTECA ?? '',
  storagePdfDir: process.env.STORAGE_PDF_DIR ?? 'storage/pdfs',
  storageCoverDir: process.env.STORAGE_COVER_DIR ?? 'storage/covers'
};
