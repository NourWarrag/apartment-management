import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface StorageProvider {
  save(file: Express.Multer.File, storagePath: string): Promise<void>;
  delete(storagePath: string): Promise<void>;
  url(storagePath: string): string;
}

class LocalStorageProvider implements StorageProvider {
  constructor(private basePath: string) {}

  async save(file: Express.Multer.File, storagePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, storagePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.buffer);
  }

  async delete(storagePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, storagePath);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }

  url(storagePath: string): string {
    return `/files/${storagePath}`;
  }
}

class S3StorageProvider implements StorageProvider {
  async save(_file: Express.Multer.File, _storagePath: string): Promise<void> {
    throw new Error('S3 storage not yet configured. Install @aws-sdk/client-s3 and implement.');
  }
  async delete(_storagePath: string): Promise<void> {
    throw new Error('S3 storage not yet configured.');
  }
  url(_storagePath: string): string {
    throw new Error('S3 storage not yet configured.');
  }
}

export function buildStoragePath(entityType: string, entityId: number, originalName: string): string {
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  return `${entityType}/${entityId}/${uuidv4()}-${base}${ext}`;
}

let _storage: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!_storage) {
    _storage = process.env.STORAGE_TYPE === 's3'
      ? new S3StorageProvider()
      : new LocalStorageProvider(path.resolve(process.env.STORAGE_PATH ?? './uploads'));
  }
  return _storage;
}

export function _resetStorage(): void {
  _storage = null;
}
