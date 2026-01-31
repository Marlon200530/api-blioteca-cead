import express, { Request } from 'express';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import fs from 'fs';
import morgan from 'morgan';
import { env } from './config/env.js';
import { corsMiddleware } from './config/cors.js';
import { authMiddleware } from './middlewares/auth.js';
import { errorHandler } from './middlewares/error-handler.js';
import authRoutes from './modules/auth/auth.routes.js';
import meRoutes from './modules/me/me.routes.js';
import materialsRoutes from './modules/materials/materials.routes.js';
import favoritesRoutes from './modules/favorites/favorites.routes.js';
import readingProgressRoutes from './modules/reading-progress/reading-progress.routes.js';
import metaRoutes from './modules/meta/meta.routes.js';
import usersRoutes from './modules/users/users.routes.js';
import publicMaterialsRoutes from './modules/materials/materials.public.routes.js';

const app = express();
app.set('trust proxy', 1);

fs.mkdirSync(env.storagePdfDir, { recursive: true });
fs.mkdirSync(env.storageCoverDir, { recursive: true });

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req as Request & { user?: { id?: string } }).user?.id ?? 'anon';
    return `${ipKeyGenerator(req)}:${userId}`;
  }
});

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(corsMiddleware);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ message: 'ok' });
});

app.use('/api/public/materials', publicMaterialsRoutes);

app.use('/api/auth', authLimiter, authRoutes);

app.use('/api', authMiddleware);
app.use('/api', apiLimiter);
app.use('/api/me', meRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/reading-progress', readingProgressRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/users', usersRoutes);

app.use(errorHandler);

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API running on http://localhost:${env.port}`);
});
