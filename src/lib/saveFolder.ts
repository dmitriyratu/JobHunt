"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The folder the browser writes documents into.
 *
 * `showDirectoryPicker` returns a handle to a real directory,
 * `getDirectoryHandle` makes the Company and Role folders inside it, and
 * `createWritable` writes the bytes. It costs one dialog, once: a handle is
 * structured-cloneable, so it goes into IndexedDB and outlives the tab.
 *
 * This replaced a server route that did the same thing with `fs`, and which was
 * correct only for as long as JobHunt ran on the machine reading it — see
 * @/lib/saveDownload for that history. Doing it here is doing it the same way
 * for everyone.
 *
 * Two things this cannot do. It cannot open a file manager afterwards, and it
 * never reveals an absolute path — only the folder's own name — so the app can
 * say a file was saved and roughly where, and nothing more.
 *
 * Chromium desktop only. Firefox and Safari have no picker, and there the app
 * falls back to an ordinary flat download; see flatDownloadName.
 */

const DB_NAME = "jobhunt-save-folder";
const DB_VERSION = 1;
const STORE_NAME = "handles";
const HANDLE_KEY = "root";

/**
 * Set when the reader cancels the picker.
 *
 * A cancelled dialog is an answer, and re-asking on every download would be
 * arguing with it. Separate from the handle, and in localStorage rather than
 * IndexedDB, because it has to be readable synchronously to decide whether to
 * prompt while the click is still live.
 */
const DECLINED_KEY = "jobhunt-save-folder-declined";

/**
 * The picker and the permission calls are not in lib.dom — they are a WICG
 * proposal Chromium ships and the other engines do not. Declared here as
 * optional members and reached through a cast, so the app compiles against a
 * DOM that has never heard of them and degrades at runtime instead.
 */
type DirectoryPicker = (options?: {
  mode?: "read" | "readwrite";
  startIn?: string;
  id?: string;
}) => Promise<FileSystemDirectoryHandle>;

type PermissionCalls = {
  queryPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
};

function picker(): DirectoryPicker | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker ?? null;
}

/** Whether this browser can be offered a folder at all. */
export function folderPickerSupported(): boolean {
  return picker() !== null;
}

// --- Storage ---------------------------------------------------------------

// Its own database rather than a store inside jobhunt-files: that one holds the
// documents people upload, and adding an object store to it means a version
// bump and an upgrade path across every existing browser, for a feature that
// can afford to simply be absent.
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

async function readStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function writeStoredHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    if (handle) store.put(handle, HANDLE_KEY);
    else store.delete(HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Shared state ----------------------------------------------------------

export type SaveFolderState = {
  /** False until the stored handle has been read back. */
  loaded: boolean;
  /** The chosen folder's name, or "" when there isn't one. */
  name: string;
  /** True once the picker has been cancelled — see DECLINED_KEY. */
  declined: boolean;
  /** False on Firefox and Safari, where there is nothing to choose with. */
  supported: boolean;
};

// A module-level store rather than a context, because the two readers are in
// different trees: the download button on the resume page and the folder row in
// the Account dialog, which AppShell renders as siblings. Changing the folder in
// one has to be visible in the other.
let handle: FileSystemDirectoryHandle | null = null;
let snapshot: SaveFolderState = { loaded: false, name: "", declined: false, supported: false };
const SERVER_SNAPSHOT: SaveFolderState = snapshot;
const listeners = new Set<() => void>();

function publish(next: Partial<SaveFolderState>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

// localStorage throws outright when a browser is set to block storage, and
// every caller here is on the path to saving a file. Losing the answer to "have
// they said no already" is worth an extra dialog; losing the download is not.
function readDeclined(): boolean {
  try {
    return localStorage.getItem(DECLINED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeDeclined(value: boolean): void {
  try {
    if (value) localStorage.setItem(DECLINED_KEY, "1");
    else localStorage.removeItem(DECLINED_KEY);
  } catch {
    // Then it is remembered for this page only, which is still better than
    // asking again in the same session.
  }
}

let loading: Promise<void> | null = null;

/**
 * Reads the stored handle once per page load.
 *
 * Every hook mount calls this and they share one promise: the alternative is a
 * dialog opening twice because two components asked at the same moment.
 *
 * Resolves whatever happens. It is awaited from inside the download click, and
 * a rejection there would take the save down with it — a browser with no
 * IndexedDB should get an ordinary download, not a button that does nothing.
 */
function load(): Promise<void> {
  loading ??= (async () => {
    const supported = folderPickerSupported();
    const declined = readDeclined();
    // The handle is worth nothing without the API that uses it, and reading it
    // on a browser that cannot is a database open for no reason.
    const stored = supported ? await readStoredHandle().catch(() => null) : null;
    handle = stored;
    publish({ loaded: true, name: stored?.name ?? "", declined, supported });
  })();
  return loading;
}

// --- Permission ------------------------------------------------------------

/**
 * Whether the handle may be written to, asking if allowed.
 *
 * A handle survives in IndexedDB but its permission does not survive the tab:
 * Chrome drops back to "prompt" on the next visit, so a stored folder needs one
 * click to reopen. `requestPermission` spends user activation, which is why
 * every path to here starts inside a click.
 */
async function hasWriteAccess(
  target: FileSystemDirectoryHandle,
  { prompt }: { prompt: boolean }
): Promise<boolean> {
  const calls = target as unknown as PermissionCalls;
  // An implementation with a picker but no permission calls would have granted
  // access at pick time; let the write be the thing that fails, if it does.
  if (!calls.queryPermission) return true;
  if ((await calls.queryPermission({ mode: "readwrite" })) === "granted") return true;
  if (!prompt || !calls.requestPermission) return false;
  return (await calls.requestPermission({ mode: "readwrite" })) === "granted";
}

// --- Actions ---------------------------------------------------------------

/**
 * Opens the folder picker. Must be called from a click.
 *
 * Returns null when the reader cancels, which is recorded so the next download
 * doesn't ask again — the Account dialog is where they can change their mind.
 */
export async function chooseSaveFolder(): Promise<FileSystemDirectoryHandle | null> {
  const show = picker();
  if (!show) return null;
  try {
    /*
     * Opens *in* Downloads, which is not the same as offering it.
     *
     * Chrome will not hand over Downloads itself — nor the home directory, the
     * desktop, or Documents. Picking one gets "can't open this folder because
     * it contains system files", which reads as a fault in whatever asked. The
     * rule is only about those four roots; anything inside them is fine, and
     * the picker has a New Folder button, so starting here puts the cursor one
     * gesture away from a folder that works.
     *
     * That is why every string offering this says "a folder inside Downloads"
     * rather than "a folder" — the copy is load-bearing, not decoration.
     *
     * id keeps the picker returning to the last choice rather than to Downloads
     * forever.
     */
    const chosen = await show({ mode: "readwrite", startIn: "downloads", id: "jobhunt-downloads" });
    handle = chosen;
    // Not fatal if it cannot be stored — the folder still works for this page,
    // and being asked again next visit beats not saving now.
    await writeStoredHandle(chosen).catch(() => {});
    writeDeclined(false);
    publish({ loaded: true, name: chosen.name, declined: false });
    return chosen;
  } catch (error) {
    /*
     * AbortError is the reader closing the dialog. Anything else — a call that
     * lost its user activation, a picker that never opened — is not a decision
     * and must not be remembered as one.
     *
     * A refused folder is indistinguishable from a refusal here: Chrome handles
     * it inside its own dialog and reports the same AbortError if the reader
     * gives up rather than choosing again. So being marked as declined is
     * survivable by design — the saved-file line stays a way back in, and so
     * does the Account dialog.
     */
    if (error instanceof DOMException && error.name === "AbortError") {
      writeDeclined(true);
      publish({ declined: true });
    }
    return null;
  }
}

/** Goes back to ordinary browser downloads. */
export async function forgetSaveFolder(): Promise<void> {
  handle = null;
  await writeStoredHandle(null).catch(() => {});
  // Recorded as declined, not merely absent: this is someone saying they want
  // browser downloads, and the next save must not reopen the picker to ask.
  writeDeclined(true);
  publish({ name: "", declined: true });
}

/**
 * The folder to write into, or null to fall back to a browser download.
 *
 * Called from the download click, and does the least it can before opening a
 * dialog: user activation lasts a few seconds, and the picker must be reached
 * while it is still alive. Nothing here builds a document or waits on a
 * network — see the callers in the resume page, which resolve this *before*
 * fetching the PDF for exactly that reason.
 */
export async function ensureSaveFolder({ prompt }: { prompt: boolean }): Promise<FileSystemDirectoryHandle | null> {
  if (!folderPickerSupported()) return null;
  await load();
  if (handle) {
    if (await hasWriteAccess(handle, { prompt })) return handle;
    // Permission was refused for a folder that is still stored. Falling back is
    // right for this download; forgetting the folder is not, because the next
    // click is one more chance to say yes.
    return null;
  }
  if (!prompt || snapshot.declined) return null;
  return chooseSaveFolder();
}

// --- Writing ---------------------------------------------------------------

/**
 * Writes one file into <root>/<segments...>/<filename>, making folders as it
 * goes, and returns the path to show — which starts at the chosen folder's name
 * because that is as much as the browser will say about where it is.
 */
export async function writeIntoFolder(
  root: FileSystemDirectoryHandle,
  segments: string[],
  filename: string,
  blob: Blob
): Promise<string> {
  let dir = root;
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create: true });
  }
  const file = await dir.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(blob);
  } finally {
    // Nothing is committed to disk until this resolves — an unclosed writable
    // leaves a zero-byte file where the resume should be.
    await writable.close();
  }
  return [root.name, ...segments, filename].join("/");
}

// --- Hook ------------------------------------------------------------------

/** The chosen folder, for anything that shows or changes it. */
export function useSaveFolder() {
  const state = useSyncExternalStore(
    useCallback((onChange: () => void) => {
      listeners.add(onChange);
      void load();
      return () => listeners.delete(onChange);
    }, []),
    () => snapshot,
    () => SERVER_SNAPSHOT
  );

  return {
    ...state,
    choose: chooseSaveFolder,
    forget: forgetSaveFolder,
  };
}
