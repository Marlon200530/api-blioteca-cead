import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { bibliotecaPool } from '../../db/pool.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { ok, okList } from '../../utils/response.js';
import { AppError } from '../../utils/errors.js';
import { requireRole } from '../../middlewares/require-role.js';
import { sanitizeOptionalText, sanitizeText } from '../../utils/sanitize.js';
import { logAudit } from '../../utils/audit.js';

const router = Router();

const listQuerySchema = z.object({
  q: z.string().optional(),
  role: z.enum(['USER', 'GESTOR_CONTEUDO', 'ADMIN']).optional(),
  status: z.enum(['ATIVO', 'INATIVO']).optional(),
  curso: z.string().optional(),
  ano: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const createUserSchema = z.object({
  codigo: z.string().min(1),
  nome: z.string().min(1),
  role: z.enum(['USER', 'GESTOR_CONTEUDO', 'ADMIN']).optional(),
  status: z.enum(['ATIVO', 'INATIVO']).optional(),
  curso: z.string().optional(),
  ano: z.number().int().min(1).optional()
});

const updateUserSchema = z.object({
  codigo: z.string().min(1).optional(),
  nome: z.string().min(1).optional(),
  role: z.enum(['USER', 'GESTOR_CONTEUDO', 'ADMIN']).optional(),
  status: z.enum(['ATIVO', 'INATIVO']).optional(),
  curso: z.string().optional(),
  ano: z.number().int().min(1).optional()
});

const paramsSchema = z.object({
  id: z.string().uuid()
});

router.get(
  '/stats',
  requireRole(['ADMIN', 'GESTOR_CONTEUDO']),
  asyncHandler(async (_req, res) => {
    const result = await bibliotecaPool.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'ATIVO')::int AS active,
        COUNT(*) FILTER (WHERE status = 'INATIVO')::int AS inactive,
        COUNT(*) FILTER (WHERE role = 'ADMIN')::int AS admins,
        COUNT(*) FILTER (WHERE role = 'GESTOR_CONTEUDO')::int AS managers,
        COUNT(*) FILTER (WHERE role = 'USER')::int AS users
      FROM users
      `
    );
    res.json(ok(result.rows[0]));
  })
);

router.get(
  '/',
  requireRole(['ADMIN']),
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listQuerySchema>;
    const sanitized = {
      ...query,
      q: query.q ? sanitizeText(query.q) : undefined,
      curso: query.curso ? sanitizeText(query.curso) : undefined
    };

    const where: string[] = [];
    const values: any[] = [];

    if (sanitized.q) {
      values.push(`%${sanitized.q}%`);
      where.push(
        `(unaccent(u.codigo) ILIKE unaccent($${values.length}) OR unaccent(u.nome) ILIKE unaccent($${values.length}))`
      );
    }
    if (sanitized.role) {
      values.push(sanitized.role);
      where.push(`u.role = $${values.length}`);
    }
    if (sanitized.status) {
      values.push(sanitized.status);
      where.push(`u.status = $${values.length}`);
    }
    if (sanitized.curso) {
      values.push(sanitized.curso);
      where.push(`p.curso = $${values.length}`);
    }
    if (sanitized.ano) {
      values.push(sanitized.ano);
      where.push(`p.ano = $${values.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const page = sanitized.page ?? 1;
    const limit = sanitized.limit ?? 20;
    const offset = (page - 1) * limit;

    const totalResult = await bibliotecaPool.query<{ count: string }>(
      `
      SELECT COUNT(*)::int AS count
      FROM users u
      LEFT JOIN user_profile p ON p.user_id = u.id
      ${whereSql}
      `,
      values
    );

    values.push(limit, offset);
    const result = await bibliotecaPool.query(
      `
      SELECT u.id, u.codigo, u.nome, u.role, u.status, u.created_at, u.updated_at,
             p.curso, p.ano, p.semestre, p.completed_profile
      FROM users u
      LEFT JOIN user_profile p ON p.user_id = u.id
      ${whereSql}
      ORDER BY u.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );

    const total = Number(totalResult.rows[0]?.count ?? 0);
    res.json(okList(result.rows, { page, limit, total }));
  })
);

router.get(
  '/export',
  requireRole(['ADMIN']),
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listQuerySchema>;
    const sanitized = {
      ...query,
      q: query.q ? sanitizeText(query.q) : undefined,
      curso: query.curso ? sanitizeText(query.curso) : undefined
    };

    const where: string[] = [];
    const values: any[] = [];

    if (sanitized.q) {
      values.push(`%${sanitized.q}%`);
      where.push(
        `(unaccent(u.codigo) ILIKE unaccent($${values.length}) OR unaccent(u.nome) ILIKE unaccent($${values.length}))`
      );
    }
    if (sanitized.role) {
      values.push(sanitized.role);
      where.push(`u.role = $${values.length}`);
    }
    if (sanitized.status) {
      values.push(sanitized.status);
      where.push(`u.status = $${values.length}`);
    }
    if (sanitized.curso) {
      values.push(sanitized.curso);
      where.push(`p.curso = $${values.length}`);
    }
    if (sanitized.ano) {
      values.push(sanitized.ano);
      where.push(`p.ano = $${values.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await bibliotecaPool.query(
      `
      SELECT u.codigo, u.nome, u.role, u.status,
             p.curso, p.ano, p.semestre, p.completed_profile,
             u.created_at, u.updated_at
      FROM users u
      LEFT JOIN user_profile p ON p.user_id = u.id
      ${whereSql}
      ORDER BY u.created_at DESC
      `,
      values
    );

    const header = [
      'codigo',
      'nome',
      'role',
      'status',
      'curso',
      'ano',
      'semestre',
      'completed_profile',
      'created_at',
      'updated_at'
    ];
    const rows = result.rows.map((row) =>
      header
        .map((key) => {
          const value = row[key];
          if (value === null || value === undefined) return '';
          const raw = String(value).replace(/\"/g, '\"\"');
          return `"${raw}"`;
        })
        .join(',')
    );
    const csv = [header.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=\"users.csv\"');
    res.status(200).send(csv);
  })
);

router.get(
  '/audit',
  requireRole(['ADMIN']),
  validate({
    query: z.object({
      action: z.string().optional(),
      userId: z.string().uuid().optional(),
      targetId: z.string().uuid().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
  }),
  asyncHandler(async (req, res) => {
    const query = req.query as {
      action?: string;
      userId?: string;
      targetId?: string;
      page?: number;
      limit?: number;
    };
    const where: string[] = [];
    const values: any[] = [];

    if (query.action) {
      values.push(query.action);
      where.push(`a.action = $${values.length}`);
    }
    if (query.userId) {
      values.push(query.userId);
      where.push(`a.user_id = $${values.length}`);
    }
    if (query.targetId) {
      values.push(query.targetId);
      where.push(`a.target_id = $${values.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const totalResult = await bibliotecaPool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM audit_logs a ${whereSql}`,
      values
    );

    values.push(limit, offset);
    const result = await bibliotecaPool.query(
      `
      SELECT a.id, a.user_id, a.action, a.target_id, a.metadata, a.created_at,
             u.codigo as user_codigo, u.nome as user_nome
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      ${whereSql}
      ORDER BY a.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );

    const total = Number(totalResult.rows[0]?.count ?? 0);
    res.json(okList(result.rows, { page, limit, total }));
  })
);

router.post(
  '/',
  requireRole(['ADMIN']),
  validate({ body: createUserSchema }),
  asyncHandler(async (req, res) => {
    const payload = req.body as z.infer<typeof createUserSchema>;
    const sanitized = {
      ...payload,
      codigo: sanitizeText(payload.codigo),
      nome: sanitizeText(payload.nome),
      curso: sanitizeOptionalText(payload.curso)
    };

    const existing = await bibliotecaPool.query('SELECT id FROM users WHERE codigo = $1', [sanitized.codigo]);
    if (existing.rows[0]) throw new AppError('Código já existe', 409, 'USER_CODE_EXISTS');

    const role = sanitized.role ?? 'USER';
    const status = sanitized.status ?? 'ATIVO';
    const passwordHash = await bcrypt.hash('123456', 10);
    const completedProfile = role !== 'USER' ? true : Boolean(sanitized.curso && sanitized.ano);

    const client = await bibliotecaPool.connect();
    try {
      await client.query('BEGIN');
    const created = await client.query(
        `
        INSERT INTO users (codigo, nome, password_hash_local, role, status, must_change_password)
        VALUES ($1, $2, $3, $4, $5, true)
        RETURNING id, codigo, nome, role, status, must_change_password, created_at, updated_at
        `,
        [sanitized.codigo, sanitized.nome, passwordHash, role, status]
      );

      const user = created.rows[0];
      await client.query(
        `
        INSERT INTO user_profile (user_id, curso, ano, semestre, completed_profile)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [user.id, sanitized.curso ?? null, sanitized.ano ?? null, null, completedProfile]
      );

      await client.query('COMMIT');
      await logAudit({
        userId: req.user!.id,
        action: 'USER_CREATE',
        targetId: user.id,
        metadata: { role, status }
      });
      res.status(201).json(ok({
        ...user,
        curso: sanitized.curso ?? null,
        ano: sanitized.ano ?? null,
        semestre: null,
        completed_profile: completedProfile
      }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

router.patch(
  '/:id',
  requireRole(['ADMIN']),
  validate({ params: paramsSchema, body: updateUserSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    const payload = req.body as z.infer<typeof updateUserSchema>;
    const sanitized = {
      ...payload,
      codigo: payload.codigo ? sanitizeText(payload.codigo) : undefined,
      nome: payload.nome ? sanitizeText(payload.nome) : undefined,
      curso: payload.curso !== undefined ? sanitizeOptionalText(payload.curso) : undefined
    };

    const existing = await bibliotecaPool.query(
      `
      SELECT u.id, u.codigo, u.nome, u.role, u.status,
             p.curso, p.ano, p.semestre, p.completed_profile
      FROM users u
      LEFT JOIN user_profile p ON p.user_id = u.id
      WHERE u.id = $1
      `,
      [id]
    );

    if (!existing.rows[0]) throw new AppError('Utilizador não encontrado', 404, 'NOT_FOUND');

    const current = existing.rows[0];
    if (sanitized.codigo && sanitized.codigo !== current.codigo) {
      const codeCheck = await bibliotecaPool.query('SELECT id FROM users WHERE codigo = $1', [sanitized.codigo]);
      if (codeCheck.rows[0]) throw new AppError('Código já existe', 409, 'USER_CODE_EXISTS');
    }
    const nextRole = sanitized.role ?? current.role;
    const nextCurso = sanitized.curso !== undefined ? sanitized.curso : current.curso;
    const nextAno = sanitized.ano !== undefined ? sanitized.ano : current.ano;
    const nextSemestre = current.semestre;
    const completedProfile = nextRole !== 'USER' ? true : Boolean(nextCurso && nextAno);

    const client = await bibliotecaPool.connect();
    try {
      await client.query('BEGIN');

      const fields: string[] = [];
      const values: any[] = [];
      const mapField = (col: string, val: any) => {
        values.push(val ?? null);
        fields.push(`${col} = $${values.length}`);
      };

      if (sanitized.codigo) mapField('codigo', sanitized.codigo);
      if (sanitized.nome) mapField('nome', sanitized.nome);
      if (sanitized.role) mapField('role', sanitized.role);
      if (sanitized.status) mapField('status', sanitized.status);

      if (fields.length) {
        values.push(id);
        await client.query(
          `UPDATE users SET ${fields.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
          values
        );
      }

      await client.query(
        `
        INSERT INTO user_profile (user_id, curso, ano, semestre, completed_profile)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id)
        DO UPDATE SET curso = EXCLUDED.curso,
                      ano = EXCLUDED.ano,
                      semestre = EXCLUDED.semestre,
                      completed_profile = EXCLUDED.completed_profile
        `,
        [id, nextCurso ?? null, nextAno ?? null, nextSemestre ?? null, completedProfile]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const refreshed = await bibliotecaPool.query(
      `
      SELECT u.id, u.codigo, u.nome, u.role, u.status, u.created_at, u.updated_at,
             p.curso, p.ano, p.semestre, p.completed_profile
      FROM users u
      LEFT JOIN user_profile p ON p.user_id = u.id
      WHERE u.id = $1
      `,
      [id]
    );

    await logAudit({
      userId: req.user!.id,
      action: 'USER_UPDATE',
      targetId: id,
      metadata: {
        role: sanitized.role ?? current.role,
        status: sanitized.status ?? current.status
      }
    });

    res.json(ok(refreshed.rows[0]));
  })
);

router.post(
  '/:id/reset-password',
  requireRole(['ADMIN']),
  validate({
    params: paramsSchema,
    body: z.object({ password: z.string().min(6) })
  }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    if (req.user?.id === id) {
      throw new AppError('Não é possível redefinir a própria senha.', 400, 'SELF_RESET_NOT_ALLOWED');
    }
    const { password } = req.body as { password: string };
    const hash = await bcrypt.hash(password, 10);
    const result = await bibliotecaPool.query(
      `UPDATE users SET password_hash_local = $1, must_change_password = true, updated_at = now() WHERE id = $2`,
      [hash, id]
    );
    if (!result.rowCount) throw new AppError('Utilizador não encontrado', 404, 'NOT_FOUND');
    await logAudit({
      userId: req.user!.id,
      action: 'USER_RESET_PASSWORD',
      targetId: id
    });
    res.status(204).end();
  })
);

router.delete(
  '/:id',
  requireRole(['ADMIN']),
  validate({ params: paramsSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>;
    if (req.user?.id === id) {
      throw new AppError('Não é possível eliminar o próprio utilizador.', 400, 'SELF_DELETE_NOT_ALLOWED');
    }
    const client = await bibliotecaPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_profile WHERE user_id = $1', [id]);
      const result = await client.query('DELETE FROM users WHERE id = $1', [id]);
      if (!result.rowCount) throw new AppError('Utilizador não encontrado', 404, 'NOT_FOUND');
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    await logAudit({
      userId: req.user!.id,
      action: 'USER_DELETE',
      targetId: id
    });
    res.status(204).end();
  })
);

export default router;
