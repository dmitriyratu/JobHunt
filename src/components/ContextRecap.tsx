import Link from "next/link";
import type { MatchReport } from "@/types";

type Props = {
  resumeFilename: string;
  resumeText: string;
  jobSource: string;
  jobDescription: string;
  report: MatchReport | null;
};

export default function ContextRecap({
  resumeFilename,
  resumeText,
  jobSource,
  jobDescription,
  report,
}: Props) {
  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-sm">Context carried over</h3>
        <Link
          href="/match"
          className="text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] hover:underline rounded-md px-2 py-1.5 -mx-2 -my-1.5"
        >
          Edit match report
        </Link>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--color-text-muted)]">Resume</span>
          <span className="text-[var(--color-text-secondary)] truncate max-w-[60%]">
            {resumeFilename || "—"} · {resumeText.length.toLocaleString()} chars
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--color-text-muted)]">Job description</span>
          <span className="text-[var(--color-text-secondary)] truncate max-w-[60%]">
            {jobSource || "—"} · {jobDescription.length.toLocaleString()} chars
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--color-text-muted)]">Match report</span>
          <span className="text-[var(--color-text-secondary)]">
            {report ? `${report.overallScore}/100 fit · ${report.items.length} requirements` : "Not analyzed"}
          </span>
        </div>
      </div>
    </div>
  );
}
