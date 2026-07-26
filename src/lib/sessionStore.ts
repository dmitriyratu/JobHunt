import type { Session } from "@/types";
import { createSession } from "./session";
import { deleteFilesForSession } from "./fileStore";

export const SESSIONS_STORAGE_KEY = "jobhunt-sessions";
export const STORE_VERSION = 1;
export const MAX_SESSIONS = 25;

export type SessionStore = {
  version: number;
  currentSessionId: string;
  /** Newest-first. Order is display order and is never re-sorted. */
  sessions: Session[];
};

export function freshStore(): SessionStore {
  const session = createSession();
  return { version: STORE_VERSION, currentSessionId: session.id, sessions: [session] };
}

function isSessionLike(value: unknown): value is Partial<Session> {
  return typeof value === "object" && value !== null && typeof (value as Session).id === "string";
}

/**
 * Never throws and always returns a store with at least one session. Corrupt
 * JSON, a version mismatch (which is also where a stale pre-sessions
 * `jobhunt-state` blob lands), a non-array `sessions`, or an unresolvable
 * `currentSessionId` all fall back cleanly.
 */
export function loadStore(): SessionStore {
  if (typeof window === "undefined") return freshStore();

  let parsed: unknown;
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return freshStore();
    parsed = JSON.parse(raw);
  } catch {
    return freshStore();
  }

  if (typeof parsed !== "object" || parsed === null) return freshStore();
  const candidate = parsed as Partial<SessionStore>;
  if (candidate.version !== STORE_VERSION) return freshStore();
  if (!Array.isArray(candidate.sessions)) return freshStore();

  // Merge each stored session over defaults so fields added later exist.
  const sessions = candidate.sessions
    .filter(isSessionLike)
    .map((s) => ({ ...createSession(), ...s }) as Session);

  if (sessions.length === 0) return freshStore();

  const currentSessionId = sessions.some((s) => s.id === candidate.currentSessionId)
    ? (candidate.currentSessionId as string)
    : sessions[0].id;

  return { version: STORE_VERSION, currentSessionId, sessions };
}

export function saveStore(store: SessionStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Almost certainly QuotaExceededError. Drop the oldest sessions that
    // aren't the one in use (and their IndexedDB blobs) and try once more.
    const keep = store.sessions.filter((s) => s.id === store.currentSessionId);
    const rest = store.sessions.filter((s) => s.id !== store.currentSessionId);
    const trimmed = [...keep, ...rest.slice(0, Math.max(0, Math.floor(rest.length / 2)))];
    const dropped = rest.slice(Math.max(0, Math.floor(rest.length / 2)));
    dropped.forEach((s) => void deleteFilesForSession(s.id));
    try {
      localStorage.setItem(
        SESSIONS_STORAGE_KEY,
        JSON.stringify({ ...store, sessions: trimmed })
      );
    } catch {
      console.warn("JobHunt: could not persist sessions — storage is full.");
    }
  }
}
