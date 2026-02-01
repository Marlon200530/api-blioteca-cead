const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const databaseUrl =
  process.env.DATABASE_URL_BIBLIOTECA || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL_BIBLIOTECA não definido no .env');
}

module.exports = {
  migrationsDir: 'migrations',
  direction: 'up',
  log: console,
  databaseUrl
};
