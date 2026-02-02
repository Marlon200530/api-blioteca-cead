import { Router } from 'express';
import { z } from 'zod';
import { bibliotecaPool } from '../../db/pool.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { ok } from '../../utils/response.js';
import { sanitizeOptionalText, sanitizeText } from '../../utils/sanitize.js';
import { requireRole } from '../../middlewares/require-role.js';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1),
  active: z.boolean().optional(),
  durationYears: z.number().int().min(1).max(6).optional()
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
  durationYears: z.number().int().min(1).max(6).optional()
});

router.get(
  '/',
  requireRole(['ADMIN']),
  asyncHandler(async (_req, res) => {
    const { rows } = await bibliotecaPool.query(
      `SELECT id, name, active, duration_years, created_at, updated_at FROM courses ORDER BY name`
    );
    res.json(ok(rows));
  })
);

router.post(
  '/',
  requireRole(['ADMIN']),
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const { name, active, durationYears } = req.body as z.infer<typeof createSchema>;
    const sanitized = sanitizeText(name);
    const { rows } = await bibliotecaPool.query(
      `
      INSERT INTO courses (name, active, duration_years)
      VALUES ($1, COALESCE($2, true), COALESCE($3, 4))
      RETURNING id, name, active, duration_years, created_at, updated_at
      `,
      [sanitized, active ?? null, durationYears ?? null]
    );
    res.status(201).json(ok(rows[0]));
  })
);

router.patch(
  '/:id',
  requireRole(['ADMIN']),
  validate({ body: patchSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, active, durationYears } = req.body as z.infer<typeof patchSchema>;
    const sanitized = name !== undefined ? sanitizeOptionalText(name) : undefined;

    const fields: string[] = [];
    const values: Array<string | boolean | number> = [];

    if (sanitized !== undefined) {
      values.push(sanitized ?? '');
      fields.push(`name = $${values.length}`);
    }

    if (active !== undefined) {
      values.push(active);
      fields.push(`active = $${values.length}`);
    }

    if (durationYears !== undefined) {
      values.push(durationYears);
      fields.push(`duration_years = $${values.length}`);
    }

    if (fields.length === 0) {
      res.json(ok(null));
      return;
    }

    values.push(id);
    const { rows } = await bibliotecaPool.query(
      `
      UPDATE courses
      SET ${fields.join(', ')}, updated_at = now()
      WHERE id = $${values.length}
      RETURNING id, name, active, duration_years, created_at, updated_at
      `,
      values
    );

    res.json(ok(rows[0]));
  })
);

router.delete(
  '/:id',
  requireRole(['ADMIN']),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    await bibliotecaPool.query(`DELETE FROM courses WHERE id = $1`, [id]);
    res.status(204).end();
  })
);

export default router;
