import { Router } from 'express';
import { z } from 'zod';
import { bibliotecaPool } from '../../db/pool.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { ok } from '../../utils/response.js';
import { requireRole } from '../../middlewares/require-role.js';

const router = Router();

const updateSchema = z.object({
  currentSemester: z.number().int().min(1).max(2)
});

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await bibliotecaPool.query<{ current_semester: number }>(
      `SELECT current_semester FROM academic_settings WHERE id = 1`
    );
    if (!rows[0]) {
      await bibliotecaPool.query(
        `INSERT INTO academic_settings (id, current_semester) VALUES (1, 1) ON CONFLICT (id) DO NOTHING`
      );
      res.json(ok({ currentSemester: 1 }));
      return;
    }
    res.json(ok({ currentSemester: rows[0].current_semester }));
  })
);

router.put(
  '/',
  requireRole(['ADMIN']),
  validate({ body: updateSchema }),
  asyncHandler(async (req, res) => {
    const { currentSemester } = req.body as z.infer<typeof updateSchema>;
    const { rows } = await bibliotecaPool.query(
      `
      INSERT INTO academic_settings (id, current_semester)
      VALUES (1, $1)
      ON CONFLICT (id)
      DO UPDATE SET current_semester = EXCLUDED.current_semester, updated_at = now()
      RETURNING current_semester
      `,
      [currentSemester]
    );
    res.json(ok({ currentSemester: rows[0]?.current_semester ?? currentSemester }));
  })
);

export default router;
