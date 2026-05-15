import { Router } from 'express';
import { buildingStats, revenue, occupancy, outstanding, maintenance } from '../controllers/reports.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);
router.use(requireRole(Role.ADMIN, Role.FINANCE));
router.get('/buildings', buildingStats);
router.get('/revenue', revenue);
router.get('/occupancy', occupancy);
router.get('/outstanding', outstanding);
router.get('/maintenance', maintenance);
export default router;
