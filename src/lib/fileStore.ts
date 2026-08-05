const DB_NAME = "jobhunt-files";
const DB_VERSION = 1;
const STORE_NAME = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFile(key: string, file: File): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(file, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadFile(key: string): Promise<File | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as File) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteFile(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export type FileSlot = "resume" | "jobDescription";

export function fileKey(sessionId: string, slot: FileSlot): string {
  return `${sessionId}:${slot}`;
}

/**
 * Key namespace for blobs that belong to the person, not to an application.
 *
 * Session ids are UUIDs, so this can never collide with one. pruneOrphanFiles
 * treats it as permanently live — see there.
 */
export const PROFILE_NAMESPACE = "profile";

/** The original file behind the saved resume — see @/lib/baseResume. */
export const PROFILE_RESUME_KEY = `${PROFILE_NAMESPACE}:resume`;

/**
 * Duplicates the blob rather than reference-counting a shared one. Costs a few
 * hundred KB per session (IndexedDB is quota'd in hundreds of MB, so fine at
 * this scale); the zero-duplication alternative is content-addressed storage
 * with refcounted deletes, which isn't worth the complexity here.
 */
export async function copyFile(fromKey: string, toKey: string): Promise<void> {
  const file = await loadFile(fromKey);
  if (!file) return;
  await saveFile(toKey, file);
}

export async function deleteFilesForSession(sessionId: string): Promise<void> {
  await Promise.all([
    deleteFile(fileKey(sessionId, "resume")),
    deleteFile(fileKey(sessionId, "jobDescription")),
  ]);
}

/**
 * Sweeps blobs whose session no longer exists. Cheap insurance: PDFs are by
 * far the biggest storage consumer, and any delete that failed or was
 * interrupted would otherwise leak forever.
 */
export async function pruneOrphanFiles(validSessionIds: string[]): Promise<void> {
  // The profile namespace is always live: the saved resume outlives every
  // application by design, and deleting all of them must not take it with them.
  const valid = new Set([...validSessionIds, PROFILE_NAMESPACE]);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.openKeyCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const key = String(cursor.key);
      const sessionId = key.split(":")[0];
      if (!valid.has(sessionId)) store.delete(cursor.key);
      cursor.continue();
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
