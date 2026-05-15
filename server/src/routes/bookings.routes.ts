import { Router } from 'express';
import { create, collectDeposit, checkout } from '../controllers/bookings.controller';
import { makeAttachmentHandlers } from '../controllers/attachments.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { uploadFile } from '../middleware/upload.middleware';
import { Role, AttachmentEntity } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);

router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.patch('/:id/deposit', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), collectDeposit);
router.patch('/:id/checkout', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.BUILDING_ADMIN), checkout);

const att = makeAttachmentHandlers(AttachmentEntity.BOOKING);
router.post('/:id/attachments', requireRole(Role.ADMIN, Role.RECEPTIONIST), uploadFile, att.upload);
router.get('/:id/attachments', att.list);
router.delete('/:id/attachments/:attId', requireRole(Role.ADMIN, Role.RECEPTIONIST), att.remove);

export default router;
