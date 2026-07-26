"use client";

import { useEffect, useState } from "react";
import { MODEL_TIERS, type ModelTier } from "@/lib/models";
import { maskApiKey, type AppSettings } from "@/lib/settings";

type Props = {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
};

const TIER_BADGE_CLASS: Record<ModelTier, string> = {
  flagship: "bg-[var(--color-accent-muted)] text-[var(--color-accent)]",
  balanced: "bg-[var(--color-success-muted)] text-[var(--color-success)]",
  budget: "bg-[var(--color-surface-overlay)] text-[var(--color-text-muted)]",
};

export default function SettingsModal({ open, onClose, settings, onSave }: Props) {
  const [draftKey, setDraftKey] = useState(settings.apiKey);
  const [draftTier, setDraftTier] = useState<ModelTier>(settings.modelTier);
  const [draftAdminKey, setDraftAdminKey] = useState(settings.adminApiKey);
  const [showKey, setShowKey] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [editingKey, setEditingKey] = useState(!settings.apiKey);

  // Re-seed the drafts each time the dialog opens so a cancelled edit doesn't
  // linger into the next visit.
  useEffect(() => {
    if (!open) return;
    setDraftKey(settings.apiKey);
    setDraftTier(settings.modelTier);
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
      modelTier: draftTier,
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
        className="glass-panel w-full max-w-3xl my-8 p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="AI settings"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border-subtle)]">
          <div>
            <h2 className="font-medium text-sm">AI settings</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Your OpenAI key and model
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
              Stored only in your browser — never sent anywhere but OpenAI. Required when the app is deployed.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-2">
              Model
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(Object.entries(MODEL_TIERS) as [ModelTier, (typeof MODEL_TIERS)[ModelTier]][]).map(
                ([tier, meta]) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setDraftTier(tier)}
                    className={`text-left rounded-lg border p-4 transition-colors ${
                      draftTier === tier
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text-muted)]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{meta.label}</span>
                      <span
                        className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${TIER_BADGE_CLASS[tier]}`}
                      >
                        {meta.cost}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] font-mono mb-1">
                      {meta.subtitle}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] leading-relaxed mb-2">
                      {meta.description}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-muted)] font-mono">
                      ${meta.pricing.input.toFixed(2)} in · ${meta.pricing.output.toFixed(2)} out /1M
                    </p>
                  </button>
                )
              )}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-2">
              Estimates — verify current rates at platform.openai.com/pricing.
            </p>
          </div>

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
              Lets Usage show OpenAI&rsquo;s own spend figures instead of local estimates. Needs an
              Admin key with the <code className="font-mono">api.usage.read</code> scope — a normal
              project key is rejected. Create one under Organization &rarr; Admin keys.
            </p>
          </div>

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
        </div>
      </div>
    </div>
  );
}
