import Link from "next/link";
import StageNav from "./StageNav";

type Props = {
  subtitle: string;
  canReachMatch: boolean;
  canReachLetter: boolean;
};

export default function AppHeader({ subtitle, canReachMatch, canReachLetter }: Props) {
  return (
    <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)]">
      <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-accent)]">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="font-semibold text-base tracking-tight">JobHunt</h1>
            <p className="text-xs text-[var(--color-text-muted)]">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <StageNav canReachMatch={canReachMatch} canReachLetter={canReachLetter} />
          <Link
            href="/usage"
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-full bg-[var(--color-surface-overlay)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14" />
            </svg>
            Usage
          </Link>
        </div>
      </div>
    </header>
  );
}
