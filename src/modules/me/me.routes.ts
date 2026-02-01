import { Router } from 'express';
import { z } from 'zod';
import { bibliotecaPool } from '../../db/pool.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { ok } from '../../utils/response.js';
import { sanitizeOptionalText, sanitizeText } from '../../utils/sanitize.js';
import bcrypt from 'bcrypt';
import { AppError } from '../../utils/errors.js';

const router = Router();

const completeProfileSchema = z.object({
  curso: z.string().min(1),
  ano: z.number().int().min(1)
});

router.post(
  '/complete-profile',
  validate({ body: completeProfileSchema }),
  asyncHandler(async (req, res) => {
    const { curso, ano } = req.body as z.infer<typeof completeProfileSchema>;
    const sanitizedCurso = sanitizeText(curso);
    const userId = req.user!.id;
    if (req.user?.role === 'USER' && req.user?.curso && req.user?.ano) {
      throw new AppError('Perfil já completo', 400, 'PROFILE_ALREADY_COMPLETED');
    }

    await bibliotecaPool.query(
      `
      UPDATE user_profile
      SET curso = $1, ano = $2, completed_profile = true
      WHERE user_id = $3
      `,
      [sanitizedCurso, ano, userId]
    );

    const user = await bibliotecaPool.query(
      `
      SELECT u.id, u.codigo, u.nome, u.role, u.status, p.curso, p.ano, p.semestre
      FROM users u
      LEFT JOIN user_profile p ON p.user_id = u.id
      WHERE u.id = $1
      `,
      [userId]
    );

    res.json(ok({ user: user.rows[0] }));
  })
);

const patchSchema = z.object({
  nome: z.string().min(1).optional(),
  curso: z.string().min(1).optional(),
  ano: z.number().int().min(1).optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(6)
});

router.patch(
  '/',
  validate({ body: patchSchema }),
  asyncHandler(async (req, res) => {
    const { nome, curso, ano } = req.body as z.infer<typeof patchSchema>;
    const userId = req.user!.id;
    const sanitizedNome = nome ? sanitizeText(nome) : undefined;
    const sanitizedCurso = curso !== undefined ? sanitizeOptionalText(curso) : undefined;

    if (sanitizedNome) {
      await bibliotecaPool.query(`UPDATE users SET nome = $1, updated_at = now() WHERE id = $2`, [
        sanitizedNome,
        userId
      ]);
    }

    if (req.user?.role === 'USER' && (sanitizedCurso || ano)) {
      throw new AppError('Perfil gerido pela administração', 403, 'PROFILE_MANAGED_BY_ADMIN');
    }

    if (sanitizedCurso || ano) {
      await bibliotecaPool.query(
        `
        UPDATE user_profile
        SET curso = COALESCE($1, curso),
            ano = COALESCE($2, ano)
        WHERE user_id = $3
        `,
        [sanitizedCurso ?? null, ano ?? null, userId]
      );
    }

    const user = await bibliotecaPool.query(
      `
      SELECT u.id, u.codigo, u.nome, u.role, u.status, p.curso, p.ano, p.semestre
      FROM users u
      LEFT JOIN user_profile p ON p.user_id = u.id
      WHERE u.id = $1
      `,
      [userId]
    );

    res.json(ok({ user: user.rows[0] }));
  })
);

router.post(
  '/password',
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
    const userId = req.user!.id;

    const result = await bibliotecaPool.query(
      `SELECT password_hash_local, must_change_password FROM users WHERE id = $1`,
      [userId]
    );
    const user = result.rows[0];
    if (!user) {
      res.status(404).json({ message: 'Utilizador não encontrado', code: 'NOT_FOUND' });
      return;
    }

    if (!user.must_change_password) {
      if (!currentPassword) {
        res.status(400).json({ message: 'Senha atual é obrigatória', code: 'CURRENT_PASSWORD_REQUIRED' });
        return;
      }
      const okPassword = await bcrypt.compare(currentPassword, user.password_hash_local);
      if (!okPassword) {
        res.status(400).json({ message: 'Senha atual inválida', code: 'INVALID_CURRENT_PASSWORD' });
        return;
      }
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await bibliotecaPool.query(
      `UPDATE users SET password_hash_local = $1, must_change_password = false, updated_at = now() WHERE id = $2`,
      [hash, userId]
    );

    res.status(204).end();
  })
);

export default router;
