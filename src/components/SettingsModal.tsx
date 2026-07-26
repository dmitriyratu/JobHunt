"use client";

import { useEffect, useState } from "react";
import { TASK_MODELS, type TaskId, type TaskModel } from "@/lib/models";
import { maskApiKey, type AppSettings } from "@/lib/settings";
import UsagePanel from "./UsagePanel";

type Props = {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
};

export default function SettingsModal({ open, onClose, settings, onSave }: Props) {
  const [draftKey, setDraftKey] = useState(settings.apiKey);
  const [draftAdminKey, setDraftAdminKey] = useState(settings.adminApiKey);
  const [showKey, setShowKey] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [editingKey, setEditingKey] = useState(!settings.apiKey);

  // Re-seed the drafts each time the dialog opens so a cancelled edit doesn't
  // linger into the next visit.
  useEffect(() => {
    if (!open) return;
    setDraftKey(settings.apiKey);
    setDraftAdminKey(settings.adminApiKey);
    setEditingKey(!settings.apiKey);
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleSave() {
    onSave({
      apiKey: draftKey.trim(),
      adminApiKey: draftAdminKey.trim(),
    });
    setSavedFlash(true);
    setEditingKey(!draftKey.trim());
    setTimeout(() => setSavedFlash(false), 2000);
  }

  const hasKey = Boolean(settings.apiKey);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-4xl my-8 p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="AI settings"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)]">
          <div>
            <h2 className="font-medium text-sm">AI settings</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Your OpenAI key, and what it has cost
            </p>
          </div>
          <button onClick={onClose} className="btn-secondary text-xs py-1.5 px-3">
            Close
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-2">
              OpenAI API key
            </label>
            {hasKey && !editingKey ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 input-base flex items-center gap-2 bg-[var(--color-surface-overlay)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-success)] shrink-0" />
                  <span className="text-sm text-[var(--color-text-secondary)] font-mono">
                    {maskApiKey(settings.apiKey)}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setEditingKey(true);
                    setDraftKey(settings.apiKey);
                  }}
                  className="btn-secondary text-xs py-2 px-3 shrink-0"
                >
                  Change
                </button>
                <button
                  onClick={() => {
                    setDraftKey("");
                    onSave({ ...settings, apiKey: "" });
                    setEditingKey(true);
                  }}
                  className="btn-secondary text-xs py-2 px-3 shrink-0 text-[var(--color-danger)]"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={draftKey}
                  onChange={(e) => setDraftKey(e.target.value)}
                  placeholder="sk-..."
                  className="input-base pr-10 font-mono text-sm"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)]"
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858 3.03a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            )}
            <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
              Stored only in your browser — never sent anywhere but OpenAI. Required when the app is
              deployed.
            </p>
          </div>

          {/* Native <details> so the disclosure is keyboard-operable and
              announced correctly without any state of its own. */}
          <details className="group rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
            <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-lg">
              <svg
                className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Advanced
              {settings.adminApiKey && (
                <span className="ml-1 h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" title="Admin key set" />
              )}
            </summary>

            <div className="px-4 pb-4 pt-1 space-y-5">
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-2">
                  OpenAI Admin key <span className="text-[var(--color-text-muted)]">(optional)</span>
                </label>
                <input
                  type="password"
                  value={draftAdminKey}
                  onChange={(e) => setDraftAdminKey(e.target.value)}
                  placeholder="sk-admin-..."
                  className="input-base font-mono text-sm"
                  autoComplete="off"
                />
                <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
                  Lets Usage below show OpenAI&rsquo;s own spend figures instead of local estimates.
                  Needs an Admin key with the <code className="font-mono">api.usage.read</code>{" "}
                  scope — a normal project key is rejected. Create one under Organization &rarr;
                  Admin keys.
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">
                  Models
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mb-3">
                  Each step runs on the model its job needs — nothing to choose.
                </p>
                <ul className="space-y-2">
                  {(Object.entries(TASK_MODELS) as [TaskId, TaskModel][]).map(([task, meta]) => (
                    <li
                      key={task}
                      className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-3"
                    >
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className="font-medium text-sm">{meta.task}</span>
                        <span className="text-xs font-mono text-[var(--color-text-secondary)] shrink-0">
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                        {meta.why}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-muted)] font-mono mt-1.5">
                        ${meta.pricing.input.toFixed(2)} in · ${meta.pricing.output.toFixed(2)} out
                        /1M
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-[var(--color-text-muted)] mt-2">
                  Rates are estimates — verify at platform.openai.com/pricing.
                </p>
              </div>
            </div>
          </details>

          <div className="flex items-center gap-3">
            <button onClick={handleSave} className="btn-primary">
              {savedFlash ? "Saved!" : "Save settings"}
            </button>
            {!hasKey && !draftKey.trim() && (
              <p className="text-xs text-[var(--color-warning)]">
                Add a key to use chat and email generation
              </p>
            )}
          </div>

          <div className="pt-5 border-t border-[var(--color-border-subtle)]">
            <h3 className="font-medium text-sm">Usage &amp; spend</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 mb-4">
              What this app has cost you
            </p>
            <UsagePanel adminApiKey={settings.adminApiKey} />
          </div>
        </div>
      </div>
    </div>
  );
}
