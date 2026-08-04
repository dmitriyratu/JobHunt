"use client";

import { useState } from "react";
import { copyPlainText } from "@/lib/copyToClipboard";

type Props = {
  value: string;
  onChange: (v: string) => void;
};

export default function SubjectField({ value, onChange }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    // Plain text only — never text/html, so pasting into an email client's
    // subject field doesn't drag markup along.
    await copyPlainText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] overflow-hidden mb-4">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">Subject</span>
        <button onClick={handleCopy} className="btn-secondary text-xs py-1.5 px-3 shrink-0">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="bg-[var(--color-surface)] p-3">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Email subject"
          // text-base below sm: iOS zooms the page on focusing a sub-16px field.
          //
          // The 44px target is `tap`, which asks about the pointer. It used to
          // be `min-h-11 sm:min-h-0`, and that gave the target back at 640px —
          // on a tablet, where the pointer is still a finger and the line box on
          // its own is 20px. A single-line input centres its text vertically, so
          // the extra height costs no layout either way.
          className="tap w-full border-0 bg-transparent text-base outline-none sm:text-sm text-[var(--color-text-primary)]"
        />
      </div>
    </div>
  );
}
