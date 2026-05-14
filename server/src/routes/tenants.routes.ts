import { Router } from 'express';
import { list, create, getById, update, remove } from '../controllers/tenants.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();

router.use(authMiddleware);

router.get('/', list);
router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.get('/:id', getById);
router.put('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST), update);
router.patch('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST), update);
router.delete('/:id', requireRole(Role.ADMIN), remove);

export default router;
