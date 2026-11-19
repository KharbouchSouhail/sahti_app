import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ApiError } from '@/lib/api';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;

const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

export function uploadRoot() {
  return path.join(process.cwd(), 'uploads');
}

export async function saveUpload(file: File) {
  if (!ALLOWED_MIME.includes(file.type as (typeof ALLOWED_MIME)[number])) {
    throw new ApiError('FILE_TYPE', 415);
  }
  if (file.size <= 0) {
    throw new ApiError('FILE_TYPE', 415);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ApiError('FILE_TOO_LARGE', 413);
  }

  const now = new Date();
  const folder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dir = path.join(uploadRoot(), folder);
  await fs.mkdir(dir, { recursive: true });

  const name = `${randomUUID()}${EXT_BY_MIME[file.type] ?? '.bin'}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(dir, name), buffer);

  return {
    storagePath: `${folder}/${name}`,
    fileName: sanitizeFileName(file.name),
    mimeType: file.type,
    sizeBytes: buffer.length,
  };
}

export function sanitizeFileName(name: string) {
  const base = path.basename(name).replace(/[^\p{L}\p{N}._-]+/gu, '_');
  return base.slice(0, 120) || 'document';
}

export function resolveStoragePath(storagePath: string) {
  const root = path.resolve(uploadRoot());
  const full = path.resolve(root, storagePath);
  if (!full.startsWith(root + path.sep)) {
    throw new ApiError('NOT_FOUND', 404);
  }
  return full;
}

export async function deleteUpload(storagePath: string) {
  try {
    await fs.unlink(resolveStoragePath(storagePath));
  } catch {
    // fichier déjà absent : rien à faire
  }
}
