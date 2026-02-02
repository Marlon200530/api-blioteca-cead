import { Router } from 'express';
import { z } from 'zod';
import { bibliotecaPool } from '../../db/pool.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { ok } from '../../utils/response.js';
import { AppError } from '../../utils/errors.js';
import { sanitizeText } from '../../utils/sanitize.js';
import { canAccessMaterial } from '../../utils/material-access.js';

const router = Router();

const listQuerySchema = z.object({
  materialId: z.string().uuid()
});

const createSchema = z.object({
  materialId: z.string().uuid(),
  page: z.coerce.number().int().min(1),
  text: z.string().min(1).max(2000)
});

const paramsSchema = z.object({
  id: z.string().uuid()
});

router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const { materialId } = req.query as z.infer<typeof listQuerySchema>;
    const materialResult = await bibliotecaPool.query('SELECT * FROM materials WHERE id = $1', [materialId]);
    const material = materialResult.rows[0];
    if (!material) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');
    if (!canAccessMaterial(req.user!, material)) throw new AppError('Sem permissão', 403, 'FORBIDDEN');

    const result = await bibliotecaPool.query(
      `
      SELECT id, material_id, page, text, created_at, updated_at
      FROM reader_notes
      WHERE user_id = $1 AND material_id = $2
      ORDER BY created_at DESC
      `,
      [req.user!.id, materialId]
    );

    res.json(ok(result.rows));
  })
);

router.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const payload = req.body as z.infer<typeof createSchema>;
    const materialResult = await bibliotecaPool.query('SELECT * FROM materials WHERE id = $1', [payload.materialId]);
    const material = materialResult.rows[0];
    if (!material) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');
    if (!canAccessMaterial(req.user!, material)) throw new AppError('Sem permissão', 403, 'FORBIDDEN');

    const result = await bibliotecaPool.query(
      `
      INSERT INTO reader_notes (user_id, material_id, page, text)
      VALUES ($1, $2, $3, $4)
      RETURNING id, material_id, page, text, created_at, updated_at
      `,
      [req.user!.id, payload.materialId, payload.page, sanitizeText(payload.text)]
    );

    res.status(201).json(ok(result.rows[0]));
  })
);

router.delete(
  '/:id',
  validate({ params: paramsSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const result = await bibliotecaPool.query(
      'DELETE FROM reader_notes WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user!.id]
    );

    if (!result.rows[0]) throw new AppError('Nota não encontrada', 404, 'NOT_FOUND');

    res.status(204).end();
  })
);

export default router;
