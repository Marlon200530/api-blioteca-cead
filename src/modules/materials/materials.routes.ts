import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { bibliotecaPool } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { ok, okList } from '../../utils/response.js';
import { AppError } from '../../utils/errors.js';
import { requireRole } from '../../middlewares/require-role.js';
import { AuthUser } from '../../types/user.js';
import { sanitizeOptionalText, sanitizeText } from '../../utils/sanitize.js';

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, file, cb) => {
    if (file.fieldname === 'pdf') {
      cb(null, env.storagePdfDir);
      return;
    }
    if (file.fieldname === 'capa') {
      cb(null, env.storageCoverDir);
      return;
    }
    cb(new Error('Campo de ficheiro inválido'), env.storagePdfDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${uuidv4()}${ext || ''}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (file.fieldname === 'pdf') {
      const validMime = file.mimetype === 'application/pdf';
      const validExt = ext === '.pdf';
      if (!validMime || !validExt) {
        console.warn('[upload] PDF rejeitado', { mime: file.mimetype, ext, name: file.originalname });
      }
      cb(validMime && validExt ? null : new Error('PDF inválido.'), validMime && validExt);
      return;
    }
    if (file.fieldname === 'capa') {
      const validMime = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
      const validExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
      if (!validMime || !validExt) {
        console.warn('[upload] Capa rejeitada', { mime: file.mimetype, ext, name: file.originalname });
      }
      cb(validMime && validExt ? null : new Error('Capa inválida.'), validMime && validExt);
      return;
    }
    cb(new Error('Campo de ficheiro inválido'));
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

const fromArray = (value: unknown) => (Array.isArray(value) ? value[0] : value);

const baseMaterialSchema = z.object({
  titulo: z.preprocess(fromArray, z.string().min(1)),
  descricao: z.preprocess(fromArray, z.string().optional()),
  kind: z.preprocess(fromArray, z.enum(['MODULO', 'PUBLICACAO'])),
  visibility: z.preprocess(fromArray, z.enum(['PUBLICO', 'PRIVADO']).optional()),
  curso: z.preprocess(fromArray, z.string().optional()),
  ano: z.coerce.number().int().min(1).optional(),
  semestre: z.coerce.number().int().min(1).optional(),
  materialType: z.preprocess(fromArray, z.enum([
    'LIVRO',
    'ARTIGO_CIENTIFICO',
    'ARTIGO_REVISTA',
    'MANUAL',
    'TEMA_TRANSVERSAL',
    'APOSTILA',
    'RELATORIO_TECNICO',
    'TESE',
    'DISSERTACAO',
    'OUTROS'
  ]).optional()),
  autor: z.preprocess(fromArray, z.string().optional()),
  anoPublicacao: z.coerce.number().int().min(1).optional()
});

const patchMaterialSchema = baseMaterialSchema.partial();

const paramsSchema = z.object({
  id: z.string().uuid()
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  kind: z.enum(['MODULO', 'PUBLICACAO']).optional(),
  materialType: z.string().optional(),
  curso: z.string().optional(),
  ano: z.coerce.number().int().optional(),
  semestre: z.coerce.number().int().optional(),
  autor: z.string().optional(),
  anoPublicacao: z.coerce.number().int().optional(),
  visibility: z.enum(['PUBLICO', 'PRIVADO']).optional(),
  status: z.enum(['ATIVO', 'INATIVO']).optional(),
  sortBy: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const canAccessMaterial = (user: AuthUser, material: any) => {
  if (user.role === 'ADMIN' || user.role === 'GESTOR_CONTEUDO') return true;
  if (material.status !== 'ATIVO') return false;
  if (material.kind === 'MODULO') {
    return true;
  }

  if (material.kind === 'PUBLICACAO' && material.visibility === 'PUBLICO') return true;

  if (material.kind === 'PUBLICACAO' && material.visibility === 'PRIVADO') {
    if (!material.curso || !user.curso) return false;
    return material.curso === user.curso;
  }

  return false;
};

const cleanupFiles = async (files: Express.Multer.File[]) => {
  for (const file of files) {
    try {
      await fs.promises.unlink(file.path);
    } catch {
      // ignore
    }
  }
};

const isValidPdfFile = async (file: Express.Multer.File) => {
  if (file.mimetype !== 'application/pdf') return false;
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext !== '.pdf') return false;
  try {
    const fd = await fs.promises.open(file.path, 'r');
    const buffer = Buffer.alloc(4);
    await fd.read(buffer, 0, 4, 0);
    await fd.close();
    return buffer.toString() === '%PDF';
  } catch {
    return false;
  }
};

const isValidImageFile = (file: Express.Multer.File) => {
  const validMime = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
  const ext = path.extname(file.originalname || '').toLowerCase();
  const validExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
  return validMime && validExt;
};

const isValidImageSignature = async (file: Express.Multer.File) => {
  try {
    const fd = await fs.promises.open(file.path, 'r');
    const header = Buffer.alloc(12);
    await fd.read(header, 0, 12, 0);
    await fd.close();

    const isJpeg = header[0] === 0xff && header[1] === 0xd8;
    const isPng =
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47;
    const isWebp =
      header.slice(0, 4).toString() === 'RIFF' &&
      header.slice(8, 12).toString() === 'WEBP';

    return isJpeg || isPng || isWebp;
  } catch {
    return false;
  }
};

const getCoverContentType = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
};

const compressCoverImage = async (file: Express.Multer.File) => {
  const basePath = file.path.replace(/\.[^.]+$/, '');
  const targetPath = `${basePath}.webp`;
  await sharp(file.path)
    .rotate()
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(targetPath);
  await fs.promises.unlink(file.path);
  return targetPath;
};

router.get(
  '/',
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const user = req.user!;
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
    if (sanitizedQuery.kind) {
      values.push(sanitizedQuery.kind);
      where.push(`m.kind = $${values.length}`);
    }
    if (sanitizedQuery.materialType) {
      values.push(sanitizedQuery.materialType);
      where.push(`m.material_type = $${values.length}`);
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
    if (sanitizedQuery.visibility) {
      values.push(sanitizedQuery.visibility);
      where.push(`m.visibility = $${values.length}`);
    }

    if (user.role === 'ADMIN' || user.role === 'GESTOR_CONTEUDO') {
      if (query.status) {
        values.push(query.status);
        where.push(`m.status = $${values.length}`);
      }
    } else {
      values.push('ATIVO');
      where.push(`m.status = $${values.length}`);
    }

    if (user.role !== 'ADMIN' && user.role !== 'GESTOR_CONTEUDO') {
      const accessParts: string[] = [];
      // Publicações públicas
      accessParts.push(`(m.kind = 'PUBLICACAO' AND m.visibility = 'PUBLICO')`);

      // Módulos visíveis para todos os utilizadores autenticados
      accessParts.push(`(m.kind = 'MODULO')`);

      // Publicações privadas por curso
      if (user.curso) {
        values.push(user.curso);
        accessParts.push(
          `(m.kind = 'PUBLICACAO' AND m.visibility = 'PRIVADO' AND m.curso = $${values.length})`
        );
      }

      where.push(`(${accessParts.join(' OR ')})`);
    }

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
  '/temas-transversais',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const values: any[] = ['PUBLICACAO', 'TEMA_TRANSVERSAL', 'PRIVADO'];
    let where = `m.kind = $1 AND m.material_type = $2 AND m.visibility = $3`;

    if (user.role !== 'ADMIN' && user.role !== 'GESTOR_CONTEUDO') {
      values.push('ATIVO');
      where += ` AND m.status = $${values.length}`;
      if (user.curso) {
        values.push(user.curso);
        where += ` AND m.curso = $${values.length}`;
      } else {
        res.json(okList([], { page: 1, limit: 0, total: 0 }));
        return;
      }
    }

    const result = await bibliotecaPool.query(
      `
      SELECT m.*
      FROM materials m
      WHERE ${where}
      ORDER BY m.updated_at DESC
      `,
      values
    );

    res.json(okList(result.rows, { page: 1, limit: result.rows.length, total: result.rows.length }));
  })
);

router.get(
  '/modules/my-course',
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (!user.curso) {
      res.json(okList([], { page: 1, limit: 0, total: 0 }));
      return;
    }

    const result = await bibliotecaPool.query(
      `
      SELECT m.*
      FROM materials m
      WHERE m.kind = 'MODULO'
        AND m.status = 'ATIVO'
        AND m.curso = $1
      ORDER BY m.updated_at DESC
      `,
      [user.curso]
    );

    res.json(okList(result.rows, { page: 1, limit: result.rows.length, total: result.rows.length }));
  })
);

router.get(
  '/:id',
  validate({ params: paramsSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const result = await bibliotecaPool.query('SELECT * FROM materials WHERE id = $1', [id]);
    const material = result.rows[0];
    if (!material) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');

    if (!canAccessMaterial(req.user!, material)) {
      throw new AppError('Sem permissão', 403, 'FORBIDDEN');
    }

    res.json(ok(material));
  })
);

router.post(
  '/',
  requireRole(['ADMIN', 'GESTOR_CONTEUDO']),
  upload.fields([
    { name: 'pdf', maxCount: 1 },
    { name: 'capa', maxCount: 1 }
  ]),
  asyncHandler(async (req, res) => {
    const files = req.files as { [field: string]: Express.Multer.File[] };
    const pdf = files?.pdf?.[0];
    const capa = files?.capa?.[0];
    let coverPath: string | null = null;

    try {
      const payload = baseMaterialSchema.parse(req.body);
      const sanitized = {
        ...payload,
        titulo: sanitizeText(payload.titulo),
        descricao: sanitizeOptionalText(payload.descricao),
        curso: sanitizeOptionalText(payload.curso),
        autor: sanitizeOptionalText(payload.autor)
      };

      if (!pdf) throw new AppError('PDF é obrigatório', 400, 'PDF_REQUIRED');
      if (sanitized.kind === 'MODULO' && !capa) {
        throw new AppError('Capa é obrigatória para MODULO', 400, 'COVER_REQUIRED');
      }
      if (sanitized.kind === 'PUBLICACAO' && !sanitized.materialType) {
        throw new AppError('materialType é obrigatório para PUBLICACAO', 400, 'MATERIAL_TYPE_REQUIRED');
      }
      if (pdf && !(await isValidPdfFile(pdf))) {
        await cleanupFiles([pdf, ...(capa ? [capa] : [])]);
        console.warn('[upload] PDF inválido (assinatura)', { name: pdf.originalname });
        throw new AppError('PDF inválido', 400, 'INVALID_PDF');
      }
      if (capa && !isValidImageFile(capa)) {
        await cleanupFiles([capa, ...(pdf ? [pdf] : [])]);
        console.warn('[upload] Capa inválida (mime/ext)', { name: capa.originalname });
        throw new AppError('Capa inválida', 400, 'INVALID_COVER');
      }
      if (capa && !(await isValidImageSignature(capa))) {
        await cleanupFiles([capa, ...(pdf ? [pdf] : [])]);
        console.warn('[upload] Capa inválida (assinatura)', { name: capa.originalname });
        throw new AppError('Capa inválida', 400, 'INVALID_COVER_SIGNATURE');
      }

      if (capa) {
        try {
          coverPath = await compressCoverImage(capa);
        } catch (err) {
          await cleanupFiles([capa, ...(pdf ? [pdf] : [])]);
          throw err;
        }
      }

      const visibility =
        sanitized.kind === 'MODULO' ? 'PRIVADO' : (sanitized.visibility ?? 'PRIVADO');

      const insert = await bibliotecaPool.query(
        `
        INSERT INTO materials (
          titulo, descricao, kind, visibility, curso, ano, semestre,
          material_type, autor, ano_publicacao, capa_path, pdf_path
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
        `,
        [
          sanitized.titulo,
          sanitized.descricao ?? null,
          sanitized.kind,
          visibility,
          sanitized.curso ?? null,
          sanitized.ano ?? null,
          sanitized.semestre ?? null,
          sanitized.materialType ?? null,
          sanitized.autor ?? null,
          sanitized.anoPublicacao ?? null,
          coverPath ? path.relative('.', coverPath) : null,
          path.relative('.', pdf.path)
        ]
      );

      res.status(201).json(ok(insert.rows[0]));
    } catch (err) {
      const extraCover = coverPath && capa && coverPath !== capa.path ? [{ path: coverPath } as Express.Multer.File] : [];
      const allFiles = [pdf, capa, ...extraCover].filter(Boolean) as Express.Multer.File[];
      await cleanupFiles(allFiles);
      throw err;
    }
  })
);

router.patch(
  '/:id',
  requireRole(['ADMIN', 'GESTOR_CONTEUDO']),
  validate({ params: paramsSchema, body: patchMaterialSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const payload = req.body as z.infer<typeof patchMaterialSchema>;
    const sanitized = {
      ...payload,
      titulo: payload.titulo ? sanitizeText(payload.titulo) : undefined,
      descricao: payload.descricao !== undefined ? sanitizeOptionalText(payload.descricao) : undefined,
      curso: payload.curso !== undefined ? sanitizeOptionalText(payload.curso) : undefined,
      autor: payload.autor !== undefined ? sanitizeOptionalText(payload.autor) : undefined
    };

    const fields: string[] = [];
    const values: any[] = [];

    const mapField = (col: string, val: any) => {
      values.push(val ?? null);
      fields.push(`${col} = $${values.length}`);
    };

    if (sanitized.titulo) mapField('titulo', sanitized.titulo);
    if (sanitized.descricao !== undefined) mapField('descricao', sanitized.descricao ?? null);
    if (sanitized.kind) mapField('kind', sanitized.kind);
    if (sanitized.visibility && sanitized.kind !== 'MODULO') mapField('visibility', sanitized.visibility);
    if (sanitized.curso !== undefined) mapField('curso', sanitized.curso ?? null);
    if (sanitized.ano !== undefined) mapField('ano', sanitized.ano ?? null);
    if (sanitized.semestre !== undefined) mapField('semestre', sanitized.semestre ?? null);
    if (sanitized.materialType !== undefined) mapField('material_type', sanitized.materialType ?? null);
    if (sanitized.autor !== undefined) mapField('autor', sanitized.autor ?? null);
    if (sanitized.anoPublicacao !== undefined) mapField('ano_publicacao', sanitized.anoPublicacao ?? null);

    if (sanitized.kind === 'MODULO') {
      mapField('visibility', 'PRIVADO');
    }

    if (!fields.length) throw new AppError('Nada para atualizar', 400, 'EMPTY_UPDATE');

    values.push(id);
    const result = await bibliotecaPool.query(
      `UPDATE materials SET ${fields.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
      values
    );

    if (!result.rows[0]) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');

    res.json(ok(result.rows[0]));
  })
);

router.patch(
  '/:id/status',
  requireRole(['ADMIN', 'GESTOR_CONTEUDO']),
  validate({ params: paramsSchema, body: z.object({ status: z.enum(['ATIVO', 'INATIVO']) }) }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const { status } = req.body as { status: 'ATIVO' | 'INATIVO' };

    const result = await bibliotecaPool.query(
      `UPDATE materials SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (!result.rows[0]) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');
    res.json(ok(result.rows[0]));
  })
);

router.delete(
  '/:id',
  requireRole(['ADMIN', 'GESTOR_CONTEUDO']),
  validate({ params: paramsSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const result = await bibliotecaPool.query('SELECT pdf_path, capa_path FROM materials WHERE id = $1', [id]);
    const material = result.rows[0];
    if (!material) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');

    await bibliotecaPool.query('DELETE FROM materials WHERE id = $1', [id]);

    if (material.pdf_path) {
      try {
        await fs.promises.unlink(material.pdf_path);
      } catch {
        // ignore
      }
    }
    if (material.capa_path) {
      try {
        await fs.promises.unlink(material.capa_path);
      } catch {
        // ignore
      }
    }

    res.json(ok({ message: 'deleted' }));
  })
);

router.get(
  '/:id/cover',
  validate({ params: paramsSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const result = await bibliotecaPool.query('SELECT * FROM materials WHERE id = $1', [id]);
    const material = result.rows[0];
    if (!material) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');

    if (!canAccessMaterial(req.user!, material)) {
      throw new AppError('Sem permissão', 403, 'FORBIDDEN');
    }

    const filePath = material.capa_path;
    if (!filePath) {
      throw new AppError('Capa não encontrada', 404, 'COVER_NOT_FOUND');
    }
    try {
      await fs.promises.stat(filePath);
    } catch {
      throw new AppError('Capa não encontrada', 404, 'COVER_NOT_FOUND');
    }

    const contentType = getCoverContentType(filePath);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  })
);

router.get(
  '/:id/reader-url',
  validate({ params: paramsSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const result = await bibliotecaPool.query('SELECT * FROM materials WHERE id = $1', [id]);
    const material = result.rows[0];
    if (!material) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');

    if (!canAccessMaterial(req.user!, material)) {
      throw new AppError('Sem permissão', 403, 'FORBIDDEN');
    }

    res.json(ok({ url: `/api/materials/${id}/pdf` }));
  })
);

router.get(
  '/:id/pdf',
  validate({ params: paramsSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const result = await bibliotecaPool.query('SELECT * FROM materials WHERE id = $1', [id]);
    const material = result.rows[0];
    if (!material) throw new AppError('Material não encontrado', 404, 'NOT_FOUND');

    if (!canAccessMaterial(req.user!, material)) {
      throw new AppError('Sem permissão', 403, 'FORBIDDEN');
    }

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
