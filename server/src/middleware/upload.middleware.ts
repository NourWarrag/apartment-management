import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const _multer = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_TYPE'));
    }
  },
}).single('file');

export function uploadFile(req: Request, res: Response, next: NextFunction): void {
  _multer(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ message: 'File too large. Maximum size is 10 MB' });
      return;
    }
    if (err instanceof Error && err.message === 'INVALID_TYPE') {
      res.status(400).json({ message: 'Invalid file type. Allowed: PDF, JPG, PNG, DOCX' });
      return;
    }
    next(err);
  });
}
