"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  canReachMatch: boolean;
  canReachLetter: boolean;
};

const STAGES = [
  { href: "/", label: "1. Resume & job", gate: null as "match" | "letter" | null },
  { href: "/match", label: "2. Match report", gate: "match" as const },
  { href: "/letter", label: "3. Write letter", gate: "letter" as const },
];

export default function StageNav({ canReachMatch, canReachLetter }: Props) {
  const pathname = usePathname();

  return (
    <div className="hidden sm:flex items-center gap-2">
      {STAGES.map((stage, i) => {
        const active = pathname === stage.href;
        const disabled =
          (stage.gate === "match" && !canReachMatch) ||
          (stage.gate === "letter" && !canReachLetter);
        const pillClasses = `flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-full transition-colors ${
          active
            ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
            : disabled
              ? "bg-[var(--color-surface-overlay)] text-[var(--color-text-muted)] opacity-50 cursor-not-allowed"
              : "bg-[var(--color-surface-overlay)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        }`;

        return (
          <div key={stage.href} className="flex items-center gap-2">
            {disabled ? (
              <span className={pillClasses} title="Complete the previous step first">
                {stage.label}
              </span>
            ) : (
              <Link href={stage.href} className={pillClasses}>
                {stage.label}
              </Link>
            )}
            {i < STAGES.length - 1 && <div className="w-4 h-px bg-[var(--color-border)]" />}
          </div>
        );
      })}
    </div>
  );
}
