"use client";

import { useEffect, useState } from "react";
import { useSaveFolder } from "@/lib/saveFolder";
import { isProfileUsable, maskApiKey, type AppSettings } from "@/lib/settings";
import { useScrollLock } from "@/lib/useScrollLock";
import { AdminKeyGuide, ApiKeyGuide } from "./KeyGuide";
import UsagePanel from "./UsagePanel";

/**
 * Your OpenAI account: the key it runs on, and what it has cost.
 *
 * Called Settings until it stopped containing any. The profile moved out to its
 * own dialog, model choice lives in code (see @/lib/models), and the theme is a
 * button in the header — which left a dialog named after a category with no
 * members. What remains is one subject, and it has a name.
 *
 * No tab strip either, for the same reason it grew one: setup and spend were
 * competing for a single scroll back when setup was also the whole contact
 * form. Connected, that section is four lines, and two tabs to divide four
 * lines from one panel is more chrome than content.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  /** Takes only the fields it changes — see useSettings for why. */
  onSave: (patch: Partial<AppSettings>) => void;
  /** Opens the profile dialog, which used to be this one's first tab. */
  onOpenProfile: () => void;
};

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

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{hint}</p>}
    </div>
  );
}

/**
 * The folder generated documents are written into.
 *
 * The picker itself is offered at the first download rather than here, because
 * that is the moment the answer is needed and the only one where everybody is
 * present. This is where you change it afterwards — a folder chosen in a hurry,
 * or a machine where you would rather have ordinary downloads back.
 */
function SaveFolderSection() {
  const { loaded, name, supported, choose, forget } = useSaveFolder();

  // Nothing until the stored folder has been read back, so this cannot render
  // "no folder chosen" for a second at someone who chose one months ago.
  if (!loaded) return null;

  return (
    <>
      <div className="border-t border-[var(--color-border-subtle)]" />
      <section>
        <SectionHeading
          title="Where files are saved"
          hint="Resumes and letters are filed under the company and the role they were written for."
        />

        {!supported ? (
          <p className="text-xs text-[var(--color-text-muted)]">
            Files go to your browser&rsquo;s download folder, one file per application, with the
            company and role in the name. Chrome and Edge on a computer can file them into folders
            instead.
          </p>
        ) : name ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="input-base flex w-full min-w-0 flex-1 items-center gap-2 overflow-hidden text-sm text-[var(--color-text-secondary)] sm:w-auto">
              <span className="truncate">
                {name}
                <span className="text-[var(--color-text-muted)]"> / Company / Role</span>
              </span>
            </span>
            <button onClick={() => void choose()} className="btn-secondary shrink-0 px-3 py-2 text-xs">
              Change
            </button>
            <button
              onClick={() => void forget()}
              className="btn-secondary shrink-0 px-3 py-2 text-xs"
              title="Go back to ordinary browser downloads"
            >
              Use downloads
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {/* Says which folder to pick, because the obvious answer is the one
                that fails: Chrome refuses Downloads itself, along with your
                home folder, the desktop and Documents. A folder inside any of
                them is fine, and the picker can make one. */}
            <p className="min-w-0 flex-1 text-xs text-[var(--color-text-muted)]">
              Files go to your browser&rsquo;s download folder, with the company and role in the
              name. Choose a folder — one <em>inside</em> Downloads, which Chrome allows, rather
              than Downloads itself, which it doesn&rsquo;t — and they will be filed into it
              instead.
            </p>
            <button onClick={() => void choose()} className="btn-secondary shrink-0 px-3 py-2 text-xs">
              Choose a folder…
            </button>
          </div>
        )}
      </section>
    </>
  );
}

export default function AccountModal({
  open,
  onClose,
  settings,
  onSave,
  onOpenProfile,
}: Props) {
  useScrollLock(open);

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

  /**
   * Writes only the two keys.
   *
   * It used to spread the whole settings object and re-state the profile and
   * the asserted facts it does not edit, because a whole-object save would
   * otherwise have erased them. That is the hazard `useSettings` removed: what
   * is not named here is left exactly as it was.
   */
  function saveKeys(next?: Partial<AppSettings>) {
    onSave({
      apiKey: draftKey.trim(),
      adminApiKey: draftAdminKey.trim(),
      ...next,
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  const hasKey = Boolean(settings.apiKey);
  const profileReady = isProfileUsable(settings.profile);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel glass-panel max-w-2xl p-0"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Account"
      >
        <div className="modal-head flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">Account</h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              The OpenAI account JobHunt runs on, and what it has cost
            </p>
          </div>
          <button onClick={onClose} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
            Close
          </button>
        </div>

        <div className="modal-body space-y-6 p-4 sm:p-5">
          <section>
            {hasKey && !editingKey ? (
              <>
                <SectionHeading title="Connected" />
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
                <div className="mt-3 flex flex-wrap items-stretch gap-3">
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
                      onSave({ apiKey: "" });
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
                <SectionHeading
                  title="Connect your OpenAI account"
                  hint="JobHunt uses OpenAI to read your resume and write your letters. You supply your own key, so the usage is billed to you and nothing is shared with anyone else. It's free to create and takes about two minutes."
                />

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
                    aria-label={showKey ? "Hide Key" : "Show Key"}
                  >
                    <EyeIcon off={showKey} />
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                  Saved only in this browser. It never goes anywhere except OpenAI.
                </p>

                <button
                  onClick={() => {
                    saveKeys();
                    setEditingKey(!draftKey.trim());
                  }}
                  disabled={!draftKey.trim()}
                  className="btn-primary mt-3 w-full"
                >
                  {savedFlash ? "Saved!" : "Save and Continue"}
                </button>

                {/* Opened on arrival when there's no key — this is the exact
                    moment the reader needs it, so making them find it is a
                    pointless extra click. */}
                <div className="mt-3">
                  <ApiKeyGuide defaultOpen={!hasKey} />
                </div>
              </>
            )}
          </section>

          <div className="border-t border-[var(--color-border-subtle)]" />

          {/*
            The Admin key sits here, with the figures it upgrades.

            It was a collapsed disclosure at the bottom of the *other* tab,
            which meant the way to make this panel useful was hidden inside the
            one place nobody looked for it. Configuration belongs next to the
            thing it configures.
          */}
          <section>
            <SectionHeading
              title="What you&rsquo;ve spent"
              hint="Estimated from what JobHunt sent, priced per model."
            />

            <details className="group mb-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
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
                Optional: show OpenAI&rsquo;s official figures
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
                <button onClick={() => saveKeys()} className="btn-secondary w-full text-xs">
                  {savedFlash ? "Saved!" : "Save"}
                </button>
              </div>
            </details>

            <UsagePanel adminApiKey={settings.adminApiKey} />
          </section>

          <SaveFolderSection />

          <div className="border-t border-[var(--color-border-subtle)]" />

          {/* Where the "Your Profile" tab went. Kept because someone who
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
                Your Profile
                {!profileReady && (
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-warning)]"
                    title="Not filled in yet"
                  />
                )}
              </span>
              <span className="mt-0.5 block text-[11px] text-[var(--color-text-muted)]">
                Your resume, and the name and contact block at the top of it.
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
      </div>
    </div>
  );
}
