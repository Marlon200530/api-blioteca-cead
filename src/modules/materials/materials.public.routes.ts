import { Router } from 'express';
import fs from 'fs';
import { z } from 'zod';
import { bibliotecaPool } from '../../db/pool.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { ok, okList } from '../../utils/response.js';
import { AppError } from '../../utils/errors.js';
import { sanitizeText } from '../../utils/sanitize.js';

const router = Router();

const paramsSchema = z.object({
  id: z.string().uuid()
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  curso: z.string().optional(),
  ano: z.coerce.number().int().optional(),
  semestre: z.coerce.number().int().optional(),
  autor: z.string().optional(),
  anoPublicacao: z.coerce.number().int().optional(),
  sortBy: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const isPublicMaterial = (material: any) =>
  material &&
  material.status === 'ATIVO' &&
  material.kind === 'PUBLICACAO' &&
  material.visibility === 'PUBLICO';

const getCoverContentType = (filePath: string) => {
  const ext = filePath.toLowerCase();
  if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) return 'image/jpeg';
  if (ext.endsWith('.png')) return 'image/png';
  if (ext.endsWith('.webp')) return 'image/webp';
  return 'application/octet-stream';
};

router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listQuerySchema>;
    const sanitizedQuery = {
      ...query,
      q: query.q ? sanitizeText(query.q) : undefined,
      curso: query.curso ? sanitizeText(query.curso) : undefined,
      autor: query.autor ? sanitizeText(query.autor) : undefined
    };
    const where: string[] = [];
    const values: any[] = [];

    if (sanitizedQuery.q) {
      values.push(`%${sanitizedQuery.q}%`);
      where.push(
        `(
          unaccent(m.titulo) ILIKE unaccent($${values.length})
          OR unaccent(m.descricao) ILIKE unaccent($${values.length})
          OR unaccent(m.curso) ILIKE unaccent($${values.length})
          OR unaccent(m.autor) ILIKE unaccent($${values.length})
        )`
      );
    }
    if (sanitizedQuery.curso) {
      values.push(sanitizedQuery.curso);
      where.push(`m.curso = $${values.length}`);
    }
    if (sanitizedQuery.ano) {
      values.push(sanitizedQuery.ano);
      where.push(`m.ano = $${values.length}`);
    }
    if (sanitizedQuery.semestre) {
      values.push(sanitizedQuery.semestre);
      where.push(`m.semestre = $${values.length}`);
    }
    if (sanitizedQuery.autor) {
      values.push(`%${sanitizedQuery.autor}%`);
      where.push(`unaccent(m.autor) ILIKE unaccent($${values.length})`);
    }
    if (sanitizedQuery.anoPublicacao) {
      values.push(sanitizedQuery.anoPublicacao);
      where.push(`m.ano_publicacao = $${values.length}`);
    }

    where.push(`m.status = 'ATIVO'`);
    where.push(`m.kind = 'PUBLICACAO'`);
    where.push(`m.visibility = 'PUBLICO'`);
    // Public materials only

    const page = sanitizedQuery.page ?? 1;
    const limit = sanitizedQuery.limit ?? 20;
    const offset = (page - 1) * limit;

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sortBy = query.sortBy === 'created_at' ? 'created_at' : 'updated_at';

    const totalResult = await bibliotecaPool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM materials m ${whereSql}`,
      values
    );

    values.push(limit, offset);
    const dataResult = await bibliotecaPool.query(
      `
      SELECT m.*
      FROM materials m
      ${whereSql}
      ORDER BY m.${sortBy} DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );

    const total = Number(totalResult.rows[0]?.count ?? 0);
    res.json(okList(dataResult.rows, { page, limit, total }));
  })
);

router.get(
  '/:id',
  validate({ params: paramsSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const result = await bibliotecaPool.query('SELECT * FROM materials WHERE id = $1', [id]);
    const material = result.rows[0];
    if (!isPublicMaterial(material)) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');
    res.json(ok(material));
  })
);

router.get(
  '/:id/reader-url',
  validate({ params: paramsSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const result = await bibliotecaPool.query('SELECT * FROM materials WHERE id = $1', [id]);
    const material = result.rows[0];
    if (!isPublicMaterial(material)) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');
    res.json(ok({ url: `/api/public/materials/${id}/pdf` }));
  })
);

router.get(
  '/:id/cover',
  validate({ params: paramsSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const result = await bibliotecaPool.query('SELECT * FROM materials WHERE id = $1', [id]);
    const material = result.rows[0];
    if (!isPublicMaterial(material)) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');

    const filePath = material.capa_path;
    if (!filePath) throw new AppError('Capa não encontrada', 404, 'COVER_NOT_FOUND');
    try {
      await fs.promises.stat(filePath);
    } catch {
      throw new AppError('Capa não encontrada', 404, 'COVER_NOT_FOUND');
    }

    res.setHeader('Content-Type', getCoverContentType(filePath));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  })
);

router.get(
  '/:id/pdf',
  validate({ params: paramsSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const result = await bibliotecaPool.query('SELECT * FROM materials WHERE id = $1', [id]);
    const material = result.rows[0];
    if (!isPublicMaterial(material)) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');

    const filePath = material.pdf_path;
    if (!filePath) throw new AppError('PDF não encontrado', 404, 'PDF_NOT_FOUND');
    if (!filePath.toLowerCase().endsWith('.pdf')) {
      throw new AppError('PDF inválido', 400, 'INVALID_PDF');
    }

    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      throw new AppError('PDF não encontrado', 404, 'PDF_NOT_FOUND');
    }
    const fileSize = stat.size;
    const range = req.headers.range;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="material-${id}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Accept-Ranges', 'bytes');

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (!match) {
        res.status(416).end();
        return;
      }

      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.status(416).end();
        return;
      }

      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunkSize.toString());

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
      return;
    }

    res.setHeader('Content-Length', fileSize.toString());
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  })
);

export default router;
