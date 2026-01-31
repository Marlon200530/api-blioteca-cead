import { Pool } from 'pg';
import { env } from '../config/env.js';

if (!env.databaseUrlCead || !env.databaseUrlBiblioteca) {
  throw new Error('DATABASE_URL_CEAD and DATABASE_URL_BIBLIOTECA are required');
}

export const ceadPool = new Pool({
  connectionString: env.databaseUrlCead
});

export const bibliotecaPool = new Pool({
  connectionString: env.databaseUrlBiblioteca
});
