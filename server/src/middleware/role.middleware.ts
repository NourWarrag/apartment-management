import { Response, NextFunction } from 'express';
import { Role } from '@hotel/shared';
import { AuthRequest } from './auth.middleware';

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    // SUPER_ADMIN passes every role check
    if (req.user.role === Role.SUPER_ADMIN || roles.includes(req.user.role)) {
      next();
      return;
    }
    res.status(403).json({ message: 'Forbidden' });
  };
}
