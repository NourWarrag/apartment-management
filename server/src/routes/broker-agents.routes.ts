import { Router } from 'express';
import { getById, update, remove, search } from '../controllers/broker-agents.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);

router.get('/', search);
router.get('/:id', getById);
router.patch('/:id', requireRole(Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE), update);
router.delete('/:id', requireRole(Role.SUPER_ADMIN, Role.ADMIN), remove);

export default router;
