import { Router } from 'express';
import { list, create, update, stats } from '../controllers/tickets.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);

// /stats MUST be registered before /:id or Express matches "stats" as an id
router.get('/stats', stats);
router.get('/', list);
router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.patch('/:id', update); // role check is inside handler (MAINTENANCE can update own)

export default router;
