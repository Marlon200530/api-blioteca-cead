import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { ceadPool, bibliotecaPool } from "../../db/pool.js";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { validate } from "../../utils/validate.js";
import { AppError } from "../../utils/errors.js";
import { ok } from "../../utils/response.js";
import { authMiddleware } from "../../middlewares/auth.js";

const router = Router();

const loginSchema = z.object({
  codigo: z.string().min(1),
  password: z.string().min(1),
});

router.post(
  "/login",
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { codigo, password } = req.body as z.infer<typeof loginSchema>;

    const localUser = await bibliotecaPool.query(
      `SELECT id, codigo, nome, password_hash_local, role, status, must_change_password FROM users WHERE codigo = $1`,
      [codigo],
    );

    if (localUser.rows[0]) {
      const user = localUser.rows[0];
      const okPassword = await bcrypt.compare(
        password,
        user.password_hash_local,
      );
      if (!okPassword) {
        throw new AppError("Credenciais inválidas", 401, "INVALID_CREDENTIALS");
      }

      if (user.status !== "ATIVO") {
        throw new AppError("Utilizador inativo", 403, "USER_INACTIVE");
      }

      const profile = await bibliotecaPool.query(
        `SELECT completed_profile FROM user_profile WHERE user_id = $1`,
        [user.id],
      );

      const token = jwt.sign({ sub: user.id }, env.jwtSecret, {
        expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
      });

      const isStaff = user.role === "ADMIN" || user.role === "GESTOR_CONTEUDO";
      res.json(
        ok({
          user: {
            id: user.id,
            codigo: user.codigo,
            nome: user.nome,
            role: user.role,
            status: user.status,
            must_change_password: user.must_change_password,
          },
          needsProfile: isStaff ? false : profile.rows[0]?.completed_profile === false,
          needsPasswordChange: Boolean(user.must_change_password),
          token,
        }),
      );
      return;
    }

    const ceadUser = await ceadPool.query(
      `SELECT codigo, nome, password_hash FROM cead_users WHERE codigo = $1`,
      [codigo],
    );

    if (!ceadUser.rows[0]) {
      throw new AppError("Credenciais inválidas", 401, "INVALID_CREDENTIALS");
    }

    const cead = ceadUser.rows[0];
    const okPassword = await bcrypt.compare(password, cead.password_hash);
    if (!okPassword) {
      throw new AppError("Credenciais inválidas", 401, "INVALID_CREDENTIALS");
    }

    const created = await bibliotecaPool.query(
      `
      INSERT INTO users (codigo, nome, password_hash_local, role, status, must_change_password)
      VALUES ($1, $2, $3, 'USER', 'ATIVO', false)
      RETURNING id, codigo, nome, role, status, must_change_password
      `,
      [cead.codigo, cead.nome, await bcrypt.hash(password, 10)],
    );

    const user = created.rows[0];

    await bibliotecaPool.query(
      `INSERT INTO user_profile (user_id, completed_profile) VALUES ($1, false)`,
      [user.id],
    );

    const token = jwt.sign({ sub: user.id }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
    });

    const isStaff = user.role === "ADMIN" || user.role === "GESTOR_CONTEUDO";
    res.json(
      ok({
        user,
        needsProfile: isStaff ? false : true,
        needsPasswordChange: false,
        token,
      }),
    );
  }),
);

router.post(
  "/logout",
  asyncHandler(async (_req, res) => {
    res.json(ok({ message: "logged-out" }));
  }),
);

router.get(
  "/me",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const isStaff = user.role === "ADMIN" || user.role === "GESTOR_CONTEUDO";
    const needsProfile = isStaff ? false : user.completed_profile === false;

    res.json(
      ok({
        user: {
          id: user.id,
          codigo: user.codigo,
          nome: user.nome,
          role: user.role,
          status: user.status,
          curso: user.curso,
          ano: user.ano,
          semestre: user.semestre,
          must_change_password: user.must_change_password,
        },
        needsProfile,
        needsPasswordChange: Boolean(user.must_change_password),
      }),
    );
  }),
);

export default router;
