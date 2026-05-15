import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import logger from '../lib/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const reqWithId = req as Request & { id?: string };

  const prismaCode =
    err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined;

  logger.error(
    { requestId: reqWithId.id, err, method: req.method, url: req.url, prismaCode },
    'Unhandled error',
  );

  res.status(500).json({ message: 'Internal server error' });
}
