import { Router } from 'express';
import { buildingStats } from '../controllers/reports.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);
router.get('/buildings', requireRole(Role.ADMIN, Role.FINANCE), buildingStats);
export default router;
