import cors from 'cors';
import { env } from './env.js';

const isPrivateIPv4 = (host: string) => {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
};

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (env.nodeEnv !== 'production') return callback(null, true);
    if (!origin || origin === 'null') return callback(null, true);
    if (env.corsOrigins.includes('*')) return callback(null, true);
    if (env.corsOrigins.includes(origin)) return callback(null, true);
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return callback(null, true);
      }
      if (isPrivateIPv4(url.hostname)) {
        return callback(null, true);
      }
    } catch {
      // ignore invalid origin
    }
    return callback(null, false);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Accept-Ranges', 'Content-Range', 'Content-Length']
});
