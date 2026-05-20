import { Router } from 'express';
import { list, create, getById, update, remove, listAgents, createAgent } from '../controllers/brokers.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);

router.get('/', list);
router.post('/', requireRole(Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE), create);
router.get('/:id', getById);
router.patch('/:id', requireRole(Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE), update);
router.delete('/:id', requireRole(Role.SUPER_ADMIN, Role.ADMIN), remove);

router.get('/:brokerId/agents', listAgents);
router.post('/:brokerId/agents', requireRole(Role.SUPER_ADMIN, Role.ADMIN, Role.FINANCE), createAgent);

export default router;
