import cors from 'cors';
import { env } from './env.js';

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (env.nodeEnv !== 'production') return callback(null, true);
    if (!origin) return callback(null, true);
    if (origin === 'null') return callback(null, false);
    if (env.corsOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Accept-Ranges', 'Content-Range', 'Content-Length']
});
