import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../../config/env';
import { AppError } from '../errors/AppError';
import { logger } from '../utils/logger';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    const fieldErrors = err.flatten().fieldErrors as Record<string, string[] | undefined>;
    const errorList: string[] = [];
    for (const messages of Object.values(fieldErrors)) {
      if (Array.isArray(messages)) {
        errorList.push(...messages);
      }
    }

    const descriptiveMessage =
      errorList.length > 0
        ? `Por favor, corrija os seguintes campos: ${errorList.join(' • ')}`
        : 'Dados de entrada inválidos. Verifique os campos destacados em vermelho.';

    res.status(422).json({
      status: 'error',
      code: 'VALIDATION_ERROR',
      message: descriptiveMessage,
      details: fieldErrors,
    });
    return;
  }

  // Tratamento seguro de violações de integridade do PostgreSQL
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const pgCode = (err as { code?: string }).code;
    if (pgCode === '23505') {
      res.status(409).json({
        status: 'error',
        code: 'CONFLICT_DUPLICATE',
        message: 'Já existe um registro com este identificador único (ex: SKU, Slug ou E-mail).',
      });
      return;
    }
    if (pgCode === '23514') {
      res.status(400).json({
        status: 'error',
        code: 'CHECK_VIOLATION',
        message: 'Operação violou regra de integridade (ex: saldo de estoque não pode ficar negativo).',
      });
      return;
    }
  }

  logger.error('Erro interno não tratado na API', {
    path: req.originalUrl,
    method: req.method,
    error: err instanceof Error ? err.message : String(err),
    ...(env.isDevelopment && err instanceof Error ? { stack: err.stack } : {}),
  });

  res.status(500).json({
    status: 'error',
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Erro interno no servidor.',
  });
}

