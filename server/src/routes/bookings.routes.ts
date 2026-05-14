import { Router } from 'express';
import { create, collectDeposit, checkout } from '../controllers/bookings.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);

router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.patch('/:id/deposit', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), collectDeposit);
router.patch('/:id/checkout', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), checkout);

export default router;
