"use client";

import { useState } from "react";
import type { AppSettings } from "@/lib/settings";
import { getTabId, type UsageEndpoint, type UsageEntry } from "@/lib/usage";
import SettingsModal from "./SettingsModal";

type Props = {
  entries: UsageEntry[];
  settings: AppSettings;
  onSettingsSave: (settings: AppSettings) => void;
};

const ENDPOINT_LABEL: Record<UsageEndpoint, string> = {
  "analyze-match": "Analyze match",
  "report-chat": "Refine chat",
  "generate-email": "Generate letter",
};

function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export default function SessionCostSummary({ entries, settings, onSettingsSave }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const tabId = getTabId();
  const sessionEntries = entries.filter((e) => e.tabId === tabId);
  if (sessionEntries.length === 0) return null;

  const total = sessionEntries.reduce((sum, e) => sum + e.costUsd, 0);
  const byEndpoint = sessionEntries.reduce<Partial<Record<UsageEndpoint, number>>>((acc, e) => {
    acc[e.endpoint] = (acc[e.endpoint] ?? 0) + e.costUsd;
    return acc;
  }, {});

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-[var(--color-text-muted)] mb-1">This session cost</p>
          <p className="text-lg font-semibold">{formatUsd(total)}</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-secondary)]">
          {(Object.keys(byEndpoint) as UsageEndpoint[]).map((endpoint) => (
            <span key={endpoint}>
              {ENDPOINT_LABEL[endpoint]}:{" "}
              <span className="font-medium text-[var(--color-text-primary)]">
                {formatUsd(byEndpoint[endpoint] ?? 0)}
              </span>
            </span>
          ))}
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="text-xs text-[var(--color-accent)] hover:underline"
        >
          Full usage →
        </button>
      </div>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={onSettingsSave}
      />
    </div>
  );
}
