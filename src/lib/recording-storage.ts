import fs from 'node:fs/promises';
import path from 'node:path';

export const MAX_CHUNK_BYTES = 12 * 1024 * 1024;

export function recordingsRoot() {
  return path.join(process.cwd(), 'uploads', 'recordings');
}

export function recordingDirectory(recordingId: string) {
  return path.join(recordingsRoot(), recordingId);
}

function assertIndex(index: number) {
  if (!Number.isInteger(index) || index < 0 || index > 20_000) {
    throw new Error('INVALID_CHUNK_INDEX');
  }
}

export function chunkPath(recordingId: string, index: number) {
  assertIndex(index);
  return path.join(recordingDirectory(recordingId), `${index}.part`);
}

export async function saveRecordingChunk(recordingId: string, index: number, data: Buffer) {
  if (data.length === 0) throw new Error('EMPTY_CHUNK');
  if (data.length > MAX_CHUNK_BYTES) throw new Error('CHUNK_TOO_LARGE');
  const dir = recordingDirectory(recordingId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(chunkPath(recordingId, index), data);
  return { index, sizeBytes: data.length };
}

export async function chunkExists(recordingId: string, index: number) {
  try {
    await fs.access(chunkPath(recordingId, index));
    return true;
  } catch {
    return false;
  }
}

export async function assembleRecording(
  recordingId: string,
  chunkCount: number,
  mimeType: string,
) {
  if (!Number.isInteger(chunkCount) || chunkCount <= 0) {
    throw new Error('NO_CHUNKS');
  }
  const missing: number[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    if (!(await chunkExists(recordingId, index))) missing.push(index);
  }
  if (missing.length > 0) {
    const error = new Error('CHUNK_MISSING');
    (error as Error & { missing?: number[] }).missing = missing;
    throw error;
  }

  const extension = mimeType.includes('mp4') ? '.m4a' : mimeType.includes('mpeg') ? '.mp3' : '.webm';
  const fileName = `audio${extension}`;
  const dir = recordingDirectory(recordingId);
  const target = path.join(dir, fileName);

  await fs.writeFile(target, Buffer.alloc(0));
  for (let index = 0; index < chunkCount; index += 1) {
    const buffer = await fs.readFile(chunkPath(recordingId, index));
    await fs.appendFile(target, buffer);
  }

  const stat = await fs.stat(target);
  return {
    storagePath: `${recordingId}/${fileName}`,
    sizeBytes: stat.size,
    mimeType,
  };
}

export function resolveRecordingPath(storagePath: string) {
  const root = path.resolve(recordingsRoot());
  const full = path.resolve(root, storagePath);
  if (!full.startsWith(root + path.sep)) {
    throw new Error('INVALID_RECORDING_PATH');
  }
  return full;
}

export async function deleteRecordingFiles(recordingId: string) {
  try {
    await fs.rm(recordingDirectory(recordingId), { recursive: true, force: true });
  } catch {
    // déjà supprimé
  }
}
