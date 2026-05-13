import { Router } from 'express';
import { maintenanceStaff } from '../controllers/users.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);
router.get('/maintenance-staff', requireRole(Role.ADMIN, Role.RECEPTIONIST), maintenanceStaff);

export default router;
