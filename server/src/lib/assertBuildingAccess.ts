import { Response } from 'express';
import { Role } from '@hotel/shared';
import { AuthRequest } from '../middleware/auth.middleware';

export function assertBuildingAccess(req: AuthRequest, res: Response, buildingId: number): boolean {
  if (
    req.user?.role === Role.BUILDING_ADMIN &&
    req.user.assignedBuildingId !== buildingId
  ) {
    res.status(403).json({ message: 'Forbidden: building access denied' });
    return false;
  }
  return true;
}
