import { Prisma } from '@prisma/client';
import { Response, NextFunction } from 'express';

interface PrismaErrorMap {
  P2025?: { status: number; message: string };
  P2002?: { status: number; message: string };
}

export function handlePrismaError(
  err: unknown,
  res: Response,
  next: NextFunction,
  errorMap: PrismaErrorMap
): void {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapping = errorMap[err.code as keyof PrismaErrorMap];
    if (mapping) {
      res.status(mapping.status).json({ message: mapping.message });
      return;
    }
  }
  next(err);
}
