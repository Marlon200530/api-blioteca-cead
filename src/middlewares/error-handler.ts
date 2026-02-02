import { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors.js';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ message: err.message, code: err.code });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ message: 'Erro interno do servidor' });
};
