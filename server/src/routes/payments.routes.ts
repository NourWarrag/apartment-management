import { Router } from 'express';
import { list, create, markPaid, stats, installmentPlans } from '../controllers/payments.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();

router.use(authMiddleware);

// Static routes first — must come before /:id to avoid param collision
router.get('/stats', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE), stats);
router.get('/installment-plans', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.FINANCE), installmentPlans);

router.get('/', list);
router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.patch('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST), markPaid);

export default router;
