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
  // MIME type is client-supplied and spoofable; this is a first-line filter only.
  // A magic-byte check (e.g. file-type package) would provide stronger guarantees.
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_TYPE'));
    }
  },
}).single('file');

// Separate multer instance for CSV uploads (bank statement import / preview).
// Accepts text/csv and text/plain (browsers and tools vary in which they send).
const CSV_MIME_TYPES = new Set(['text/csv', 'text/plain', 'application/csv', 'application/octet-stream']);

const _multerCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (CSV_MIME_TYPES.has(file.mimetype) || file.originalname.endsWith('.csv')) {
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

export function uploadCsv(req: Request, res: Response, next: NextFunction): void {
  _multerCsv(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ message: 'File too large. Maximum size is 5 MB' });
      return;
    }
    if (err instanceof Error && err.message === 'INVALID_TYPE') {
      res.status(400).json({ message: 'Invalid file type. Expected CSV' });
      return;
    }
    next(err);
  });
}
