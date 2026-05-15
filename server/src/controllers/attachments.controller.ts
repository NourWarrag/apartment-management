import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { getStorage, buildStoragePath } from '../lib/storage';
import { AttachmentEntity } from '@hotel/shared';

type EntityChecker = (id: number) => Promise<boolean>;

const ENTITY_EXISTS: Record<AttachmentEntity, EntityChecker> = {
  [AttachmentEntity.APARTMENT]: (id) =>
    prisma.apartment.findUnique({ where: { id } }).then(Boolean),
  [AttachmentEntity.TENANT]: (id) =>
    prisma.tenant.findUnique({ where: { id } }).then(Boolean),
  [AttachmentEntity.BOOKING]: (id) =>
    prisma.booking.findUnique({ where: { id } }).then(Boolean),
  [AttachmentEntity.TICKET]: (id) =>
    prisma.maintenanceTicket.findUnique({ where: { id } }).then(Boolean),
};

const ENTITY_LABEL: Record<AttachmentEntity, string> = {
  [AttachmentEntity.APARTMENT]: 'Apartment',
  [AttachmentEntity.TENANT]: 'Tenant',
  [AttachmentEntity.BOOKING]: 'Booking',
  [AttachmentEntity.TICKET]: 'Ticket',
};

export function makeAttachmentHandlers(entityType: AttachmentEntity) {
  async function upload(req: AuthRequest, res: Response): Promise<void> {
    try {
      const entityId = Number(req.params.id);
      if (!entityId || entityId <= 0) {
        res.status(400).json({ message: 'Invalid ID' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ message: 'File is required' });
        return;
      }
      const exists = await ENTITY_EXISTS[entityType](entityId);
      if (!exists) {
        res.status(404).json({ message: `${ENTITY_LABEL[entityType]} not found` });
        return;
      }

      const storage = getStorage();
      const storagePath = buildStoragePath(entityType, entityId, req.file.originalname);
      await storage.save(req.file, storagePath);

      const attachment = await prisma.attachment.create({
        data: {
          entityType,
          entityId,
          filename: req.file.originalname,
          storagePath,
          mimeType: req.file.mimetype,
          size: req.file.size,
          uploadedBy: req.user!.id,
        },
      });

      res.status(201).json({
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        url: storage.url(storagePath),
        createdAt: attachment.createdAt,
      });
    } catch {
      res.status(500).json({ message: 'Failed to save file' });
    }
  }

  async function list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const entityId = Number(req.params.id);
      if (!entityId || entityId <= 0) {
        res.status(400).json({ message: 'Invalid ID' });
        return;
      }

      const attachments = await prisma.attachment.findMany({
        where: { entityType, entityId },
        include: { uploader: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      });

      const storage = getStorage();
      res.json(
        attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
          url: storage.url(a.storagePath),
          uploadedBy: a.uploader,
          createdAt: a.createdAt,
        }))
      );
    } catch {
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  async function remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      const entityId = Number(req.params.id);
      const attId = Number(req.params.attId);
      if (!entityId || entityId <= 0 || !attId || attId <= 0) {
        res.status(400).json({ message: 'Invalid ID' });
        return;
      }

      const attachment = await prisma.attachment.findFirst({
        where: { id: attId, entityType, entityId },
      });
      if (!attachment) {
        res.status(404).json({ message: 'Attachment not found' });
        return;
      }

      const storage = getStorage();
      await storage.delete(attachment.storagePath);
      await prisma.attachment.delete({ where: { id: attId } });

      res.status(204).end();
    } catch {
      res.status(500).json({ message: 'Internal server error' });
    }
  }

  return { upload, list, remove };
}
