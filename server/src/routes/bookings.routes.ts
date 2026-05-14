import { Router } from 'express';
import { create } from '../controllers/bookings.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);
router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
export default router;
