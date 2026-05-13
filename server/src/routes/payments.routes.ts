import { Router } from 'express';
import { list, create, markPaid } from '../controllers/payments.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();

router.use(authMiddleware);

router.get('/', list);
router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.patch('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST), markPaid);

export default router;
