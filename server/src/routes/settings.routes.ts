import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@hotel/shared';
import { getSettings, updateSettings } from '../controllers/settings.controller';

const router = Router();

router.use(authMiddleware);

router.get('/', getSettings);
router.patch('/', requireRole(Role.ADMIN, Role.SUPER_ADMIN), updateSettings);

export default router;
