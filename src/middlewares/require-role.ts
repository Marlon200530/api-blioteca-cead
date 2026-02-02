import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors.js';
import { UserRole } from '../types/user.js';

export const requireRole = (roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AppError('Não autenticado', 401, 'UNAUTHENTICATED'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new AppError('Sem permissão', 403, 'FORBIDDEN'));
      return;
    }

    next();
  };
};
