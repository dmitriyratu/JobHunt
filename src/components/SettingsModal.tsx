"use client";

import { useEffect, useState } from "react";
import {
  isProfileUsable,
  maskApiKey,
  type AppSettings,
  type ResumeProfile,
} from "@/lib/settings";
import { AdminKeyGuide, ApiKeyGuide } from "./KeyGuide";
import ProfileFields from "./ProfileFields";
import UsagePanel from "./UsagePanel";

type Props = {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
};

/**
 * "Your details" first: it is the tab you come back to. The key is entered once
 * and then forgotten, and spend is something you check rather than change.
 */
export type Tab = "details" | "setup" | "usage";

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
}: Props) {
  const [tab, setTab] = useState<Tab>("details");
  const [draftKey, setDraftKey] = useState(settings.apiKey);
  const [draftAdminKey, setDraftAdminKey] = useState(settings.adminApiKey);
  const [draftProfile, setDraftProfile] = useState<ResumeProfile>(settings.profile);
  const [showKey, setShowKey] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [editingKey, setEditingKey] = useState(!settings.apiKey);

  // Re-seed the drafts each time the dialog opens so a cancelled edit doesn't
  // linger into the next visit.
  useEffect(() => {
    if (!open) return;
    setDraftKey(settings.apiKey);
    setDraftAdminKey(settings.adminApiKey);
    setDraftProfile(settings.profile);
    setEditingKey(!settings.apiKey);
    setTab("details");
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
      profile: draftProfile,
      ...next,
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  const hasKey = Boolean(settings.apiKey);
  const profileReady = isProfileUsable(settings.profile);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-6"
      onClick={onClose}
    >
      <div
        className="glass-panel my-2 w-full max-w-3xl overflow-hidden p-0 sm:my-8"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <h2 className="text-sm font-medium">Settings</h2>
          <button onClick={onClose} className="btn-secondary px-3 py-1.5 text-xs">
            Close
          </button>
        </div>

        {/* Separate jobs, separate tabs. Setting up a key, entering the details
            that head your resume, and watching what you've spent were competing
            for the same scroll and none of them read clearly. */}
        <div
          role="tablist"
          aria-label="Settings sections"
          className="flex gap-1 border-b border-[var(--color-border-subtle)] px-3 pt-2"
        >
          {(
            [
              ["details", "Your details"],
              ["setup", "Setup"],
              ["usage", "What you've spent"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === id
                  ? "border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]"
                  : "border-b-2 border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {label}
              {((id === "setup" && !hasKey) || (id === "details" && !profileReady)) && (
                <span
                  className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-warning)] align-middle"
                  title="Not set up yet"
                />
              )}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-5">
          {tab === "details" ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium">The header on your resumes</h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  These sit at the top of every resume JobHunt generates. We fill them in
                  from your first upload, but PDF text extraction mangles phone numbers and
                  links often enough that it&rsquo;s worth a look. Correct anything wrong
                  here and it stays fixed for every application.
                </p>
              </div>

              <ProfileFields value={draftProfile} onChange={setDraftProfile} />

              <p className="text-xs text-[var(--color-text-muted)]">
                Saved only in this browser, and kept out of every AI request except the one
                that writes your resume.
              </p>

              <button onClick={() => save({})} className="btn-primary w-full">
                {savedFlash ? "Saved!" : "Save details"}
              </button>
            </div>
          ) : tab === "setup" ? (
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

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="input-base flex flex-1 items-center gap-2 bg-[var(--color-surface-overlay)] font-mono text-sm text-[var(--color-text-secondary)]">
                      {maskApiKey(settings.apiKey)}
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
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-secondary)]"
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
                <summary className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-3 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]">
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
            </div>
          ) : (
            <UsagePanel adminApiKey={settings.adminApiKey} />
          )}
        </div>
      </div>
    </div>
  );
}
