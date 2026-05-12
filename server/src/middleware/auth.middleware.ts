import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';
import { Role } from '@hotel/shared';

export interface AuthRequest extends Request {
  user?: { id: number; role: Role };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.token as string | undefined;
  if (!token) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.id as number, role: payload.role as Role };
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}
