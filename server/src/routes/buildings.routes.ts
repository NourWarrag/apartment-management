import { Router } from 'express';
import { list, getById, create, update, remove } from '../controllers/buildings.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);

router.get('/', list);
router.get('/:id', getById);
router.post('/', requireRole(Role.ADMIN), create);
router.patch('/:id', requireRole(Role.ADMIN), update);
router.delete('/:id', requireRole(Role.ADMIN), remove);

export default router;
