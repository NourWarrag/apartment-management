import { Router } from 'express';
import { list, create, update, stats } from '../controllers/tickets.controller';
import { makeAttachmentHandlers } from '../controllers/attachments.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { uploadFile } from '../middleware/upload.middleware';
import { Role, AttachmentEntity } from '@hotel/shared';

const router = Router();
router.use(authMiddleware);

// /stats MUST be registered before /:id or Express matches "stats" as an id
router.get('/stats', stats);
router.get('/', list);
router.post('/', requireRole(Role.ADMIN, Role.RECEPTIONIST), create);
router.patch('/:id', update); // role check is inside handler (MAINTENANCE can update own)

const att = makeAttachmentHandlers(AttachmentEntity.TICKET);
router.post('/:id/attachments', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE), uploadFile, att.upload);
router.get('/:id/attachments', att.list);
router.delete('/:id/attachments/:attId', requireRole(Role.ADMIN, Role.RECEPTIONIST, Role.MAINTENANCE), att.remove);

export default router;
