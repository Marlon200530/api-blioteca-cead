import { Router } from 'express';
import { z } from 'zod';
import { bibliotecaPool } from '../../db/pool.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { ok } from '../../utils/response.js';
import { AppError } from '../../utils/errors.js';
import { sanitizeOptionalText, sanitizeText } from '../../utils/sanitize.js';

const router = Router();

const collectionSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  materialIds: z.array(z.string().uuid()).optional()
});

const patchSchema = collectionSchema.partial();

const paramsSchema = z.object({
  id: z.string().uuid()
});

const itemSchema = z.object({
  materialId: z.string().uuid()
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await bibliotecaPool.query(
      `
      SELECT
        c.id,
        c.name,
        c.description,
        c.created_at,
        c.updated_at,
        COALESCE(array_agg(ci.material_id) FILTER (WHERE ci.material_id IS NOT NULL), '{}') AS material_ids
      FROM collections c
      LEFT JOIN collection_items ci ON ci.collection_id = c.id
      WHERE c.user_id = $1
      GROUP BY c.id
      ORDER BY c.updated_at DESC
      `,
      [req.user!.id]
    );

    res.json(ok(result.rows));
  })
);

router.post(
  '/',
  validate({ body: collectionSchema }),
  asyncHandler(async (req, res) => {
    const payload = req.body as z.infer<typeof collectionSchema>;
    const sanitized = {
      name: sanitizeText(payload.name),
      description: sanitizeOptionalText(payload.description)
    };

    const insert = await bibliotecaPool.query(
      `
      INSERT INTO collections (user_id, name, description)
      VALUES ($1, $2, $3)
      RETURNING id, name, description, created_at, updated_at
      `,
      [req.user!.id, sanitized.name, sanitized.description ?? null]
    );

    const collection = insert.rows[0];
    const materialIds = payload.materialIds ?? [];

    if (materialIds.length > 0) {
      await bibliotecaPool.query(
        `
        INSERT INTO collection_items (collection_id, material_id)
        SELECT $1, m.id
        FROM materials m
        WHERE m.id = ANY($2::uuid[])
        ON CONFLICT DO NOTHING
        `,
        [collection.id, materialIds]
      );
    }

    const itemsResult = await bibliotecaPool.query(
      'SELECT material_id FROM collection_items WHERE collection_id = $1',
      [collection.id]
    );

    res.status(201).json(
      ok({
        ...collection,
        material_ids: itemsResult.rows.map((row) => row.material_id)
      })
    );
  })
);

router.patch(
  '/:id',
  validate({ params: paramsSchema, body: patchSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const payload = req.body as z.infer<typeof patchSchema>;

    if (!payload.name && payload.description === undefined && !payload.materialIds) {
      throw new AppError('Nada para atualizar', 400, 'EMPTY_UPDATE');
    }

    const fields: string[] = [];
    const values: any[] = [];

    const mapField = (col: string, val: any) => {
      values.push(val ?? null);
      fields.push(`${col} = $${values.length}`);
    };

    if (payload.name) mapField('name', sanitizeText(payload.name));
    if (payload.description !== undefined) mapField('description', sanitizeOptionalText(payload.description));

    values.push(id, req.user!.id);

    const result = await bibliotecaPool.query(
      `
      UPDATE collections
      SET ${fields.length ? fields.join(', ') + ', ' : ''}updated_at = now()
      WHERE id = $${values.length - 1} AND user_id = $${values.length}
      RETURNING id, name, description, created_at, updated_at
      `,
      values
    );

    if (!result.rows[0]) throw new AppError('Coleção não encontrada', 404, 'NOT_FOUND');

    if (payload.materialIds) {
      await bibliotecaPool.query('DELETE FROM collection_items WHERE collection_id = $1', [id]);
      if (payload.materialIds.length > 0) {
        await bibliotecaPool.query(
          `
          INSERT INTO collection_items (collection_id, material_id)
          SELECT $1, m.id
          FROM materials m
          WHERE m.id = ANY($2::uuid[])
          ON CONFLICT DO NOTHING
          `,
          [id, payload.materialIds]
        );
      }
    }

    const itemsResult = await bibliotecaPool.query(
      'SELECT material_id FROM collection_items WHERE collection_id = $1',
      [id]
    );

    res.json(
      ok({
        ...result.rows[0],
        material_ids: itemsResult.rows.map((row) => row.material_id)
      })
    );
  })
);

router.delete(
  '/:id',
  validate({ params: paramsSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const result = await bibliotecaPool.query(
      'DELETE FROM collections WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user!.id]
    );

    if (!result.rows[0]) throw new AppError('Coleção não encontrada', 404, 'NOT_FOUND');

    res.status(204).end();
  })
);

router.post(
  '/:id/items',
  validate({ params: paramsSchema, body: itemSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const { materialId } = req.body as z.infer<typeof itemSchema>;

    const collection = await bibliotecaPool.query(
      'SELECT id FROM collections WHERE id = $1 AND user_id = $2',
      [id, req.user!.id]
    );
    if (!collection.rows[0]) throw new AppError('Coleção não encontrada', 404, 'NOT_FOUND');

    const material = await bibliotecaPool.query('SELECT id FROM materials WHERE id = $1', [materialId]);
    if (!material.rows[0]) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');

    await bibliotecaPool.query(
      'INSERT INTO collection_items (collection_id, material_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, materialId]
    );
    await bibliotecaPool.query('UPDATE collections SET updated_at = now() WHERE id = $1', [id]);

    res.status(204).end();
  })
);

router.delete(
  '/:id/items/:materialId',
  validate({ params: paramsSchema.extend({ materialId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const { id, materialId } = req.params as { id: string; materialId: string };

    const result = await bibliotecaPool.query(
      'DELETE FROM collection_items WHERE collection_id = $1 AND material_id = $2 RETURNING collection_id',
      [id, materialId]
    );
    if (!result.rows[0]) throw new AppError('Item não encontrado', 404, 'NOT_FOUND');

    await bibliotecaPool.query('UPDATE collections SET updated_at = now() WHERE id = $1', [id]);

    res.status(204).end();
  })
);

export default router;
