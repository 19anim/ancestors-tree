import type { RequestHandler } from 'express';
import { AppError } from './AppError.ts';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));
};
