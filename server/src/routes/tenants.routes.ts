import { Router } from 'express';
import { list, create, getById, update, remove } from '../controllers/tenants.controller';
import { makeAttachmentHandlers } from '../controllers/attachments.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { uploadFile } from '../middleware/upload.middleware';
import { Role, AttachmentEntity } from '@hotel/shared';

const router = Router();

router.use(authMiddleware);

router.get('/', list);
router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.get('/:id', getById);
router.put('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST), update);
router.patch('/:id', requireRole(Role.ADMIN, Role.RECEPTIONIST), update);
router.delete('/:id', requireRole(Role.ADMIN), remove);

const att = makeAttachmentHandlers(AttachmentEntity.TENANT);
router.post('/:id/attachments', requireRole(Role.ADMIN, Role.RECEPTIONIST), uploadFile, att.upload);
router.get('/:id/attachments', att.list);
router.delete('/:id/attachments/:attId', requireRole(Role.ADMIN, Role.RECEPTIONIST), att.remove);

export default router;
