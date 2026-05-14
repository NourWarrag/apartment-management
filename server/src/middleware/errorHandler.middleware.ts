import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const reqWithId = req as Request & { id?: string };
  logger.error(
    { requestId: reqWithId.id, err, method: req.method, url: req.url },
    'Unhandled error',
  );
  res.status(500).json({ message: 'Internal server error' });
}
