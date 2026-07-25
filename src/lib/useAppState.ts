"use client";

import { useCallback, useEffect, useState } from "react";
import { initialAppState, type AppState } from "@/types";

const STORAGE_KEY = "jobhunt-state";

export function useJobHuntState() {
  const [state, setState] = useState<AppState>(initialAppState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<AppState>;
        setState({ ...initialAppState, ...saved });
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  const update = useCallback(
    <K extends keyof AppState>(key: K, value: AppState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const patch = useCallback((partial: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  return { state, setState, update, patch, hydrated };
}
