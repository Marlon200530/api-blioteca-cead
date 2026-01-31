import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { bibliotecaPool } from '../db/pool.js';
import { AppError } from '../utils/errors.js';
import { AuthUser } from '../types/user.js';

type TokenPayload = { sub: string };

export const authMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new AppError('Não autenticado', 401, 'UNAUTHENTICATED'));
    return;
  }

  const token = authHeader.replace('Bearer ', '').trim();
  try {
    const payload = jwt.verify(token, env.jwtSecret) as TokenPayload;
    const userId = payload.sub;
    if (!userId) {
      next(new AppError('Token inválido', 401, 'INVALID_TOKEN'));
      return;
    }

    const { rows } = await bibliotecaPool.query<AuthUser>(
      `
      SELECT u.id, u.codigo, u.nome, u.role, u.status,
             u.must_change_password,
             p.curso, p.ano, p.semestre, p.completed_profile
      FROM users u
      LEFT JOIN user_profile p ON p.user_id = u.id
      WHERE u.id = $1
      `,
      [userId]
    );

    if (!rows[0]) {
      next(new AppError('Utilizador não encontrado', 401, 'USER_NOT_FOUND'));
      return;
    }

    if (rows[0].status !== 'ATIVO') {
      next(new AppError('Utilizador inativo', 403, 'USER_INACTIVE'));
      return;
    }

    req.user = rows[0];
    next();
  } catch {
    next(new AppError('Token inválido', 401, 'INVALID_TOKEN'));
  }
};
