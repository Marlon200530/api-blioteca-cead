import { Router } from 'express';
import { z } from 'zod';
import { bibliotecaPool } from '../../db/pool.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { ok, okList } from '../../utils/response.js';
import { AppError } from '../../utils/errors.js';
import { AuthUser } from '../../types/user.js';

const router = Router();

const querySchema = z.object({
  materialId: z.string().uuid().optional()
});

const paramsSchema = z.object({
  materialId: z.string().uuid()
});

const bodySchema = z.object({
  currentPage: z.number().int().min(0),
  totalPages: z.number().int().min(0)
});
const timeSchema = z.object({
  seconds: z.number().int().min(1).max(60 * 60)
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const canAccessMaterial = (user: AuthUser, material: any) => {
  if (user.role === 'ADMIN' || user.role === 'GESTOR_CONTEUDO') return true;
  if (material.status !== 'ATIVO') return false;
  if (material.kind === 'MODULO') return true;
  if (material.kind === 'PUBLICACAO' && material.visibility === 'PUBLICO') return true;
  if (material.kind === 'PUBLICACAO' && material.visibility === 'PRIVADO') {
    if (!material.curso || !user.curso) return false;
    return material.curso === user.curso;
  }
  return false;
};

const ensureMaterialAccess = async (user: AuthUser, materialId: string) => {
  const result = await bibliotecaPool.query('SELECT * FROM materials WHERE id = $1', [materialId]);
  const material = result.rows[0];
  if (!material) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');
  if (!canAccessMaterial(user, material)) throw new AppError('Sem permissão', 403, 'FORBIDDEN');
  return material;
};

router.get(
  '/materials',
  validate({ query: paginationSchema }),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query as z.infer<typeof paginationSchema>;
    const offset = (page - 1) * limit;
    const user = req.user!;

    const accessWhere: string[] = [];
    const accessValues: any[] = [user.id];

    if (user.role !== 'ADMIN' && user.role !== 'GESTOR_CONTEUDO') {
      accessWhere.push(`m.status = 'ATIVO'`);
      const accessParts: string[] = [];
      accessParts.push(`(m.kind = 'MODULO')`);
      accessParts.push(`(m.kind = 'PUBLICACAO' AND m.visibility = 'PUBLICO')`);
      if (user.curso) {
        accessValues.push(user.curso);
        accessParts.push(
          `(m.kind = 'PUBLICACAO' AND m.visibility = 'PRIVADO' AND m.curso = $${accessValues.length})`
        );
      }
      accessWhere.push(`(${accessParts.join(' OR ')})`);
    }

    const accessSql = accessWhere.length ? `AND ${accessWhere.join(' AND ')}` : '';
    const limitIndex = accessValues.length + 1;
    const offsetIndex = accessValues.length + 2;

    const totalResult = await bibliotecaPool.query<{ count: string }>(
      `
      SELECT COUNT(*)::int AS count
      FROM reading_progress rp
      JOIN materials m ON m.id = rp.material_id
      WHERE rp.user_id = $1
      ${accessSql}
      `,
      accessValues
    );

    const dataResult = await bibliotecaPool.query(
      `
      SELECT m.*
      FROM reading_progress rp
      JOIN materials m ON m.id = rp.material_id
      WHERE rp.user_id = $1
      ${accessSql}
      ORDER BY rp.updated_at DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `,
      [...accessValues, limit, offset]
    );

    const total = Number(totalResult.rows[0]?.count ?? 0);
    res.json(okList(dataResult.rows, { page, limit, total }));
  })
);

router.get(
  '/',
  validate({ query: querySchema }),
  asyncHandler(async (req, res) => {
    const { materialId } = req.query as z.infer<typeof querySchema>;

    if (materialId) {
      await ensureMaterialAccess(req.user!, materialId);
      const result = await bibliotecaPool.query(
        `SELECT * FROM reading_progress WHERE user_id = $1 AND material_id = $2`,
        [req.user!.id, materialId]
      );
      res.json(ok(result.rows[0] ?? null));
      return;
    }

    const user = req.user!;
    const accessWhere: string[] = [];
    const accessValues: any[] = [user.id];

    if (user.role !== 'ADMIN' && user.role !== 'GESTOR_CONTEUDO') {
      accessWhere.push(`m.status = 'ATIVO'`);
      const accessParts: string[] = [];
      accessParts.push(`(m.kind = 'MODULO')`);
      accessParts.push(`(m.kind = 'PUBLICACAO' AND m.visibility = 'PUBLICO')`);
      if (user.curso) {
        accessValues.push(user.curso);
        accessParts.push(
          `(m.kind = 'PUBLICACAO' AND m.visibility = 'PRIVADO' AND m.curso = $${accessValues.length})`
        );
      }
      accessWhere.push(`(${accessParts.join(' OR ')})`);
    }

    const accessSql = accessWhere.length ? `AND ${accessWhere.join(' AND ')}` : '';
    const result = await bibliotecaPool.query(
      `
      SELECT rp.*
      FROM reading_progress rp
      JOIN materials m ON m.id = rp.material_id
      WHERE rp.user_id = $1
      ${accessSql}
      ORDER BY rp.updated_at DESC
      `,
      accessValues
    );
    res.json(ok(result.rows));
  })
);

router.put(
  '/:materialId',
  validate({ params: paramsSchema, body: bodySchema }),
  asyncHandler(async (req, res) => {
    const { materialId } = req.params as z.infer<typeof paramsSchema>;
    const { currentPage, totalPages } = req.body as z.infer<typeof bodySchema>;
    const percentage = totalPages > 0 ? Math.min(100, (currentPage / totalPages) * 100) : 0;

    await ensureMaterialAccess(req.user!, materialId);

    await bibliotecaPool.query(
      `
      INSERT INTO reading_progress (user_id, material_id, current_page, total_pages, percentage, updated_at)
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (user_id, material_id)
      DO UPDATE SET current_page = EXCLUDED.current_page,
                    total_pages = EXCLUDED.total_pages,
                    percentage = EXCLUDED.percentage,
                    updated_at = now()
      `,
      [req.user!.id, materialId, currentPage, totalPages, percentage]
    );

    res.status(204).end();
  })
);

router.put(
  '/:materialId/time',
  validate({ params: paramsSchema, body: timeSchema }),
  asyncHandler(async (req, res) => {
    const { materialId } = req.params as z.infer<typeof paramsSchema>;
    const { seconds } = req.body as z.infer<typeof timeSchema>;

    await ensureMaterialAccess(req.user!, materialId);

    await bibliotecaPool.query(
      `
      INSERT INTO reading_progress (user_id, material_id, reading_time_seconds, updated_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (user_id, material_id)
      DO UPDATE SET reading_time_seconds = reading_progress.reading_time_seconds + EXCLUDED.reading_time_seconds,
                    updated_at = now()
      `,
      [req.user!.id, materialId, seconds]
    );

    res.status(204).end();
  })
);

export default router;
