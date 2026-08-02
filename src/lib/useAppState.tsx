"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { toShapeOrNull } from "./documentShape";
import { copyFile, deleteFilesForSession, fileKey, pruneOrphanFiles } from "./fileStore";
import { createSession, EMPTY_SESSION } from "./session";
import { normalizeTailoredResume } from "./tailoredResume";
import {
  loadStore,
  saveStore,
  freshStore,
  MAX_SESSIONS,
  type SessionStore,
} from "./sessionStore";
import type { Session } from "@/types";

const PERSIST_DEBOUNCE_MS = 300;

type SessionContextValue = {
  state: Session;
  setState: Dispatch<SetStateAction<Session>>;
  update: <K extends keyof Session>(key: K, value: Session[K]) => void;
  patch: (partial: Partial<Session>) => void;
  hydrated: boolean;

  /** Only committed applications — drafts stay hidden until they're promoted. */
  sessions: Session[];
  currentSessionId: string;
  newSession: () => Promise<string>;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => void;
  /** Promotes the current draft into a real application in the rail. */
  commitSession: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<SessionStore>(freshStore);
  const [hydrated, setHydrated] = useState(false);

  // Kept fresh so the once-registered flush handlers below don't read a
  // stale captured `store`.
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  });

  useEffect(() => {
    const loaded = loadStore();
    // Repairs resumes saved before skills were grouped — see
    // normalizeTailoredResume. Done here rather than in loadStore so the
    // storage layer stays free of resume-shaped knowledge.
    setStore({
      ...loaded,
      sessions: loaded.sessions.map((s) => ({
        ...s,
        tailoredResume: normalizeTailoredResume(s.tailoredResume),
        // Absent on anything saved before the LaTeX document existed. Reading
        // back as undefined would put the editor into an uncontrolled state on
        // the first keystroke.
        resumeTex: s.resumeTex ?? "",
        resumeSkipped: s.resumeSkipped ?? false,
        // Absent on anything uploaded before the proofread existed. An empty
        // list is the same as never checked as far as the UI is concerned:
        // there is nothing outstanding either way.
        spellingSuggestions: s.spellingSuggestions ?? [],
        nameVariants: s.nameVariants ?? [],
        // Anything saved before the picker existed carried a shape chosen from
        // the old two-button control, with no recommendation behind it. The
        // absent reason is the marker: null both, and the posting is re-read
        // and the choice re-offered once, next time that application is opened.
        // toShapeOrNull also covers a session saved by a build that had a shape
        // this one doesn't: it re-asks rather than rendering against a spec that
        // resolves to no sections at all.
        documentShape: s.recommendedShapeReason ? toShapeOrNull(s.documentShape) : null,
        recommendedShape: s.recommendedShapeReason ? toShapeOrNull(s.recommendedShape) : null,
        recommendedShapeReason: s.recommendedShapeReason ?? "",
        recommendedShapeConfident: s.recommendedShapeConfident ?? true,
      })),
    });
    setHydrated(true);
    void pruneOrphanFiles(loaded.sessions.map((s) => s.id));
  }, []);

  // The whole session array re-serializes on every keystroke, so debounce.
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(() => saveStore(storeRef.current), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [hydrated, store]);

  // Flush pending debounced writes when the tab goes away.
  useEffect(() => {
    const flush = () => saveStore(storeRef.current);
    const onVisibility = () => {
      if (document.hidden) flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const current =
    store.sessions.find((s) => s.id === store.currentSessionId) ?? EMPTY_SESSION;
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  });

  const setState = useCallback<Dispatch<SetStateAction<Session>>>((action) => {
    setStore((prevStore) => {
      const i = prevStore.sessions.findIndex((s) => s.id === prevStore.currentSessionId);
      if (i === -1) return prevStore;
      const prev = prevStore.sessions[i];
      const next = typeof action === "function" ? action(prev) : action;
      // Several callers (accept/reject proposal) return `prev` unchanged on
      // no-op branches — without this bail-out those would bump updatedAt and
      // trigger a pointless persist.
      if (next === prev) return prevStore;
      const sessions = [...prevStore.sessions];
      sessions[i] = {
        ...next,
        id: prev.id,
        createdAt: prev.createdAt,
        updatedAt: new Date().toISOString(),
      };
      return { ...prevStore, sessions };
    });
  }, []);

  const update = useCallback<SessionContextValue["update"]>(
    (key, value) => setState((prev) => ({ ...prev, [key]: value })),
    [setState]
  );

  const patch = useCallback(
    (partial: Partial<Session>) => setState((prev) => ({ ...prev, ...partial })),
    [setState]
  );

  const newSession = useCallback(async () => {
    const cur = currentRef.current;
    const next = createSession({
      resumeText: cur.resumeText,
      resumeFilename: cur.resumeFilename,
    });
    // Await before the state flip so the new session's resume preview can't
    // race ahead of its blob.
    if (cur.id && cur.resumeFilename) {
      await copyFile(fileKey(cur.id, "resume"), fileKey(next.id, "resume"));
    }
    setStore((prev) => {
      // Abandoned drafts are invisible, so they'd otherwise pile up forever.
      const withoutDrafts = prev.sessions.filter((s) => s.committed);
      prev.sessions
        .filter((s) => !s.committed)
        .forEach((s) => void deleteFilesForSession(s.id));

      let sessions = [next, ...withoutDrafts];
      if (sessions.length > MAX_SESSIONS) {
        const dropped = sessions.slice(MAX_SESSIONS);
        sessions = sessions.slice(0, MAX_SESSIONS);
        dropped.forEach((s) => void deleteFilesForSession(s.id));
      }
      return { ...prev, sessions, currentSessionId: next.id };
    });
    return next.id;
  }, []);

  const commitSession = useCallback(() => {
    setStore((prev) => {
      const i = prev.sessions.findIndex((s) => s.id === prev.currentSessionId);
      if (i === -1 || prev.sessions[i].committed) return prev;
      const sessions = [...prev.sessions];
      sessions[i] = { ...sessions[i], committed: true };
      return { ...prev, sessions };
    });
  }, []);

  const switchSession = useCallback((id: string) => {
    setStore((prev) =>
      prev.sessions.some((s) => s.id === id) ? { ...prev, currentSessionId: id } : prev
    );
  }, []);

  const deleteSession = useCallback((id: string) => {
    setStore((prev) => {
      const sessions = prev.sessions.filter((s) => s.id !== id);
      if (sessions.length === 0) {
        const replacement = createSession();
        return { ...prev, sessions: [replacement], currentSessionId: replacement.id };
      }
      const currentSessionId =
        prev.currentSessionId === id ? sessions[0].id : prev.currentSessionId;
      return { ...prev, sessions, currentSessionId };
    });
    void deleteFilesForSession(id);
  }, []);

  return (
    <SessionContext.Provider
      value={{
        state: current,
        setState,
        update,
        patch,
        hydrated,
        sessions: store.sessions.filter((s) => s.committed),
        currentSessionId: store.currentSessionId,
        newSession,
        switchSession,
        deleteSession,
        commitSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useJobHuntState(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useJobHuntState must be used inside <SessionProvider>");
  return ctx;
}
