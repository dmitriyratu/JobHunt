"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Shared state for the assistant's open/closed toggle.
 *
 * The control lives in the applications rail and the panel lives inside the
 * page, and those are siblings — AppShell renders the page and the rail next to
 * each other, so neither can pass a prop to the other. This is the smallest
 * thing that lets the rail drive a panel it doesn't own.
 *
 * Each step registers what its chat is called and whether it has one at all;
 * the rail renders the button from that. Nothing here knows what any particular
 * chat does, which is what keeps a match-report concern out of the shell.
 */

type Registration = {
  available: boolean;
  label: string;
  pendingCount: number;
};

type ChatDockValue = Registration & {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  register: (next: Registration) => void;
};

const EMPTY: Registration = { available: false, label: "Refine", pendingCount: 0 };

const ChatDockContext = createContext<ChatDockValue | null>(null);

export function ChatDockProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [registration, setRegistration] = useState<Registration>(EMPTY);

  const register = useCallback((next: Registration) => {
    // Guarded so a page re-rendering with identical values doesn't loop through
    // a state update on every render.
    setRegistration((prev) =>
      prev.available === next.available &&
      prev.label === next.label &&
      prev.pendingCount === next.pendingCount
        ? prev
        : next
    );
  }, []);

  const value = useMemo<ChatDockValue>(
    () => ({
      ...registration,
      open,
      setOpen,
      toggle: () => setOpen((v) => !v),
      register,
    }),
    [registration, open, register]
  );

  return <ChatDockContext.Provider value={value}>{children}</ChatDockContext.Provider>;
}

export function useChatDock(): ChatDockValue {
  const ctx = useContext(ChatDockContext);
  if (!ctx) throw new Error("useChatDock must be used inside <ChatDockProvider>");
  return ctx;
}

/**
 * Declares this step's chat to the rail.
 *
 * Unregisters on unmount so navigating to a step without one (the letter) can't
 * leave a button behind that opens nothing.
 */
export function useRegisterChat(registration: Registration): void {
  const { register, setOpen } = useChatDock();
  const { available, label, pendingCount } = registration;

  useEffect(() => {
    register({ available, label, pendingCount });
  }, [register, available, label, pendingCount]);

  useEffect(
    () => () => {
      register(EMPTY);
      // Closed on the way out, so arriving at the next step doesn't find a
      // panel open that belongs to the step you just left.
      setOpen(false);
    },
    [register, setOpen]
  );
}
