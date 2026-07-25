"use client";

import { useState } from "react";
import { MODEL_TIERS, type ModelTier } from "@/lib/models";
import { maskApiKey, type AppSettings } from "@/lib/settings";
import type { ModelPricing } from "@/lib/pricing";

type Props = {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
};

export default function SettingsPanel({ settings, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draftKey, setDraftKey] = useState("");
  const [draftTier, setDraftTier] = useState<ModelTier>(settings.modelTier);
  const [draftBudget, setDraftBudget] = useState(String(settings.monthlyBudgetUsd));
  const [draftPricing, setDraftPricing] = useState(settings.pricing);
  const [showKey, setShowKey] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [editingKey, setEditingKey] = useState(!settings.apiKey);

  function handleOpen() {
    setOpen((v) => !v);
    if (!open) {
      setDraftKey(settings.apiKey);
      setDraftTier(settings.modelTier);
      setDraftBudget(String(settings.monthlyBudgetUsd));
      setDraftPricing(settings.pricing);
      setEditingKey(!settings.apiKey);
    }
  }

  function updatePricing(tier: ModelTier, field: keyof ModelPricing, value: string) {
    const num = Number(value);
    setDraftPricing((prev) => ({
      ...prev,
      [tier]: { ...prev[tier], [field]: Number.isFinite(num) && num >= 0 ? num : prev[tier][field] },
    }));
  }

  function handleSave() {
    const budget = Number(draftBudget);
    const next: AppSettings = {
      apiKey: draftKey.trim(),
      modelTier: draftTier,
      monthlyBudgetUsd: Number.isFinite(budget) && budget >= 0 ? budget : settings.monthlyBudgetUsd,
      pricing: draftPricing,
    };
    onSave(next);
    setSavedFlash(true);
    setEditingKey(!next.apiKey);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  const hasKey = Boolean(settings.apiKey);
  const tierMeta = MODEL_TIERS[settings.modelTier];

  return (
    <div className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]">
      <div className="max-w-6xl mx-auto px-6">
        <button
          onClick={handleOpen}
          className="w-full flex items-center justify-between py-3 text-left group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-overlay)] group-hover:bg-[var(--color-border)] transition-colors">
              <svg className="h-4 w-4 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">AI settings</p>
              <p className="text-xs text-[var(--color-text-muted)] truncate">
                {hasKey ? (
                  <>
                    {tierMeta.label} · {tierMeta.subtitle} · Key {maskApiKey(settings.apiKey)}
                  </>
                ) : (
                  "Add your OpenAI key and pick a model"
                )}
              </p>
            </div>
          </div>
          <svg
            className={`h-4 w-4 text-[var(--color-text-muted)] shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="pb-5 space-y-5">
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
                <div className="flex gap-2">
                  <div className="relative flex-1">
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
                </div>
              )}
              <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
                Saved locally in your browser. Falls back to server .env if empty.
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-2">
                Model
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                          className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${
                            tier === "premium"
                              ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                              : "bg-[var(--color-success-muted)] text-[var(--color-success)]"
                          }`}
                        >
                          {meta.cost}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-secondary)] font-mono mb-1">
                        {meta.subtitle}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                        {meta.description}
                      </p>
                    </button>
                  )
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-2">
                Budget &amp; pricing
              </label>
              <div className="mb-3">
                <label className="text-xs text-[var(--color-text-muted)] block mb-1">
                  Monthly budget (USD)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draftBudget}
                  onChange={(e) => setDraftBudget(e.target.value)}
                  className="input-base max-w-[160px]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.entries(MODEL_TIERS) as [ModelTier, (typeof MODEL_TIERS)[ModelTier]][]).map(
                  ([tier, meta]) => (
                    <div key={tier} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <p className="text-xs font-medium mb-2">{meta.subtitle} ($/1M tokens)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-[var(--color-text-muted)] block mb-1">Input</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draftPricing[tier].input}
                            onChange={(e) => updatePricing(tier, "input", e.target.value)}
                            className="input-base text-sm py-1.5"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[var(--color-text-muted)] block mb-1">Output</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draftPricing[tier].output}
                            onChange={(e) => updatePricing(tier, "output", e.target.value)}
                            className="input-base text-sm py-1.5"
                          />
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-2">
                Estimates — verify current rates at platform.openai.com/pricing.
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
        )}
      </div>
    </div>
  );
}
