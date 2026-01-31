import { Router } from 'express';
import { z } from 'zod';
import { bibliotecaPool } from '../../db/pool.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { ok } from '../../utils/response.js';

const router = Router();

const paramsSchema = z.object({
  materialId: z.string().uuid()
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await bibliotecaPool.query(
      'SELECT material_id FROM favorites WHERE user_id = $1',
      [req.user!.id]
    );

    res.json(ok(result.rows.map((r) => r.material_id)));
  })
);

router.post(
  '/:materialId',
  validate({ params: paramsSchema }),
  asyncHandler(async (req, res) => {
    const { materialId } = req.params as z.infer<typeof paramsSchema>;
    await bibliotecaPool.query(
      'INSERT INTO favorites (user_id, material_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user!.id, materialId]
    );
    res.status(204).end();
  })
);

router.delete(
  '/:materialId',
  validate({ params: paramsSchema }),
  asyncHandler(async (req, res) => {
    const { materialId } = req.params as z.infer<typeof paramsSchema>;
    await bibliotecaPool.query('DELETE FROM favorites WHERE user_id = $1 AND material_id = $2', [
      req.user!.id,
      materialId
    ]);
    res.status(204).end();
  })
);

export default router;
