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
          // min-h-11 below sm: the line box alone is 24px tall, which is the bare
          // WCAG minimum for something this important to hit. A single-line input
          // centres its text vertically, so the extra height costs no layout.
          className="w-full min-h-11 bg-transparent border-0 outline-none text-base sm:min-h-0 sm:text-sm text-[var(--color-text-primary)]"
        />
      </div>
    </div>
  );
}
