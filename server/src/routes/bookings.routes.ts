import { Router } from 'express';
import { create, collectDeposit, checkout, getById, list, update } from '../controllers/bookings.controller';
import { makeAttachmentHandlers } from '../controllers/attachments.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { uploadFile } from '../middleware/upload.middleware';
import { Role, AttachmentEntity } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);

router.get('/', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), list);
router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.get('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), getById);
router.patch('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), update);
router.patch('/:id/deposit', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), collectDeposit);
router.patch('/:id/checkout', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), checkout);

const att = makeAttachmentHandlers(AttachmentEntity.BOOKING);
router.post('/:id/attachments', requireRole(Role.ADMIN, Role.RECEPTIONIST), uploadFile, att.upload);
// booking attachments require role guard (no open GET /:id route on bookings)
router.get('/:id/attachments', requireRole(Role.ADMIN, Role.RECEPTIONIST), att.list);
router.delete('/:id/attachments/:attId', requireRole(Role.ADMIN, Role.RECEPTIONIST), att.remove);

export default router;
