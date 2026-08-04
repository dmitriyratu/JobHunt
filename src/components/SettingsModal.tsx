"use client";

import { useEffect, useState } from "react";
import { isProfileUsable, maskApiKey, type AppSettings } from "@/lib/settings";
import { AdminKeyGuide, ApiKeyGuide } from "./KeyGuide";
import UsagePanel from "./UsagePanel";

type Props = {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  /** Opens the profile dialog, which used to be this one's first tab. */
  onOpenProfile: () => void;
};

/**
 * Two tabs, both about the account rather than about you.
 *
 * "Your details" used to lead this dialog and is now its own — see ProfileModal.
 * What is left shares one lifecycle: connect a key once, then occasionally look
 * at what it has cost. A pointer to the profile stays at the foot of Setup,
 * because "where did my details go" is a fair question exactly once.
 */
export type Tab = "setup" | "usage";

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {off ? (
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858 3.03a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
      ) : (
        <>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </>
      )}
    </svg>
  );
}

export default function SettingsModal({
  open,
  onClose,
  settings,
  onSave,
  onOpenProfile,
}: Props) {
  const [tab, setTab] = useState<Tab>("setup");
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
    setTab("setup");
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

  function save(next: Partial<AppSettings>) {
    onSave({
      apiKey: draftKey.trim(),
      adminApiKey: draftAdminKey.trim(),
      // Carried through untouched. This dialog edits neither the profile nor
      // the stated facts, but it still writes the whole settings blob, so
      // omitting either would erase it.
      profile: settings.profile,
      assertedFacts: settings.assertedFacts,
      ...next,
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  const hasKey = Boolean(settings.apiKey);
  const profileReady = isProfileUsable(settings.profile);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="modal-panel glass-panel max-w-3xl p-0"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="modal-head flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <h2 className="text-sm font-medium">Settings</h2>
          <button onClick={onClose} className="btn-secondary px-3 py-1.5 text-xs">
            Close
          </button>
        </div>

        {/* Separate jobs, separate tabs. Setting up a key and watching what
            you've spent were competing for the same scroll. */}
        <div
          role="tablist"
          aria-label="Settings sections"
          className="modal-head flex gap-1 border-b border-[var(--color-border-subtle)] px-3 pt-2"
        >
          {(
            [
              ["setup", "Setup"],
              ["usage", "What you've spent"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`tap rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === id
                  ? "border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"
                  : "border-b-2 border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {label}
              {id === "setup" && !hasKey && (
                <span
                  className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-warning)] align-middle"
                  title="Not set up yet"
                />
              )}
            </button>
          ))}
        </div>

        <div className="modal-body p-4 sm:p-5">
          {tab === "setup" ? (
            <div className="space-y-4">
              {hasKey && !editingKey ? (
                <>
                  <div className="rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success-muted)] px-4 py-3">
                    <p className="text-sm font-medium text-[var(--color-success)]">
                      ✓ You&rsquo;re all set
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                      JobHunt is connected to your OpenAI account.
                    </p>
                  </div>

                  {/* The masked key is `.input-base`, so it is 48px tall; the
                      two buttons beside it were 34px. `items-stretch` makes the
                      row agree on one height rather than centring three
                      different ones, and the key keeps a line of its own on a
                      phone where it cannot share with two buttons. */}
                  <div className="flex flex-wrap items-stretch gap-3">
                    <span className="input-base flex w-full min-w-0 flex-1 items-center gap-2 overflow-hidden font-mono text-sm text-[var(--color-text-secondary)] sm:w-auto">
                      <span className="truncate">{maskApiKey(settings.apiKey)}</span>
                    </span>
                    <button
                      onClick={() => {
                        setEditingKey(true);
                        setDraftKey(settings.apiKey);
                      }}
                      className="btn-secondary shrink-0 px-3 py-2 text-xs"
                    >
                      Replace
                    </button>
                    <button
                      onClick={() => {
                        setDraftKey("");
                        onSave({ ...settings, apiKey: "" });
                        setEditingKey(true);
                      }}
                      className="btn-secondary shrink-0 px-3 py-2 text-xs text-[var(--color-danger)]"
                    >
                      Remove
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h3 className="text-sm font-medium">Connect your OpenAI account</h3>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                      JobHunt uses OpenAI to read your resume and write your letters. You supply
                      your own key, so the usage is billed to you and nothing is shared with anyone
                      else. It&rsquo;s free to create and takes about two minutes.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="openai-key"
                      className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
                    >
                      Paste your key here
                    </label>
                    <div className="relative">
                      <input
                        id="openai-key"
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
                        className="tap-area absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-secondary)]"
                        aria-label={showKey ? "Hide key" : "Show key"}
                      >
                        <EyeIcon off={showKey} />
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                      Saved only in this browser. It never goes anywhere except OpenAI.
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      save({});
                      setEditingKey(!draftKey.trim());
                    }}
                    disabled={!draftKey.trim()}
                    className="btn-primary w-full"
                  >
                    {savedFlash ? "Saved!" : "Save and continue"}
                  </button>

                  {/* Opened on arrival when there's no key — this is the exact
                      moment the reader needs it, so making them find it is a
                      pointless extra click. */}
                  <ApiKeyGuide defaultOpen={!hasKey} />
                </>
              )}

              <details className="group rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
                <summary className="tap flex cursor-pointer items-center gap-2 rounded-lg px-4 py-3 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
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
                  Optional: show OpenAI&rsquo;s official spend figures
                  {settings.adminApiKey && (
                    <span
                      className="ml-1 h-1.5 w-1.5 rounded-full bg-[var(--color-success)]"
                      title="Configured"
                    />
                  )}
                </summary>

                <div className="space-y-2 px-4 pb-4 pt-1">
                  <input
                    type="password"
                    value={draftAdminKey}
                    onChange={(e) => setDraftAdminKey(e.target.value)}
                    placeholder="sk-admin-..."
                    className="input-base font-mono text-sm"
                    autoComplete="off"
                    aria-label="OpenAI Admin key"
                  />
                  <AdminKeyGuide />
                  <button onClick={() => save({})} className="btn-secondary w-full text-xs">
                    {savedFlash ? "Saved!" : "Save"}
                  </button>
                </div>
              </details>

              {/* Where the "Your details" tab went. Kept because someone who
                  filled it in here once will come back here looking for it, and
                  a dead end is worse than a redirect. */}
              <button
                onClick={() => {
                  onClose();
                  onOpenProfile();
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-4 py-3 text-left transition-colors hover:border-[var(--color-text-muted)]"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                    Your details
                    {!profileReady && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-warning)]"
                        title="Not filled in yet"
                      />
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[var(--color-text-muted)]">
                    The name and contact block at the top of every resume.
                  </span>
                </span>
                <svg
                  className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          ) : (
            <UsagePanel adminApiKey={settings.adminApiKey} />
          )}
        </div>
      </div>
    </div>
  );
}
