import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { requireFeature } from '../middleware/requireFeature';
import { Role, FeatureFlag } from '@hotel/shared';
import {
  list,
  getById,
  create,
  update,
  deactivate,
  reactivate,
  maintenanceStaff,
} from '../controllers/users.controller';

const router = Router();

router.use(authMiddleware);

router.get('/maintenance-staff', requireFeature(FeatureFlag.STAFF), requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), maintenanceStaff);
router.get('/', requireRole(Role.ADMIN, Role.SUPER_ADMIN), list);
router.get('/:id', requireRole(Role.ADMIN, Role.SUPER_ADMIN), getById);
router.post('/', requireRole(Role.ADMIN, Role.SUPER_ADMIN), create);
router.patch('/:id', requireRole(Role.ADMIN, Role.SUPER_ADMIN), update);
router.post('/:id/deactivate', requireRole(Role.ADMIN, Role.SUPER_ADMIN), deactivate);
router.post('/:id/reactivate', requireRole(Role.ADMIN, Role.SUPER_ADMIN), reactivate);

export default router;
