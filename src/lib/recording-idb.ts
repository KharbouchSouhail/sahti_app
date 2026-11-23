const DB_NAME = 'sehhati-recordings';
const STORE = 'chunks';
const VERSION = 1;

export type BufferedChunk = {
  recordingId: string;
  index: number;
  blob: Blob;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('INDEXEDDB_UNAVAILABLE'));
      return;
    }
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('recordingId', 'recordingId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('INDEXEDDB_ERROR'));
  });
}

function keyFor(recordingId: string, index: number) {
  return `${recordingId}:${index}`;
}

export async function saveChunkToIdb(recordingId: string, index: number, blob: Blob) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({
      key: keyFor(recordingId, index),
      recordingId,
      index,
      blob,
      createdAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('INDEXEDDB_WRITE'));
  });
  db.close();
}

export async function listBufferedChunks(recordingId: string): Promise<BufferedChunk[]> {
  const db = await openDb();
  const chunks = await new Promise<BufferedChunk[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const index = tx.objectStore(STORE).index('recordingId');
    const request = index.getAll(recordingId);
    request.onsuccess = () => resolve(request.result as BufferedChunk[]);
    request.onerror = () => reject(request.error ?? new Error('INDEXEDDB_READ'));
  });
  db.close();
  return chunks.sort((a, b) => a.index - b.index);
}

export async function deleteBufferedChunks(recordingId: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const index = tx.objectStore(STORE).index('recordingId');
    const request = index.openCursor(recordingId);
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('INDEXEDDB_DELETE'));
  });
  db.close();
}

export async function countBufferedChunks(recordingId: string) {
  const chunks = await listBufferedChunks(recordingId);
  return chunks.length;
}
