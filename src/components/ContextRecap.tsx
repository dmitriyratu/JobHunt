"use client";

import Link from "next/link";
import type { MatchReport } from "@/types";

type Props = {
  resumeFilename: string;
  resumeText: string;
  jobSource: string;
  jobDescription: string;
  report: MatchReport | null;
  jobTitle: string;
  detectedCompany: string;
  companyName: string;
  onCompanyNameChange: (v: string) => void;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-[var(--color-text-muted)] shrink-0">{label}</span>
      <span className="text-[var(--color-text-secondary)] text-right min-w-0">{children}</span>
    </div>
  );
}

export default function ContextRecap({
  resumeFilename,
  resumeText,
  jobSource,
  jobDescription,
  report,
  jobTitle,
  detectedCompany,
  companyName,
  onCompanyNameChange,
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
        {jobTitle && <Row label="Role">{jobTitle}</Row>}

        {detectedCompany ? (
          <Row label="Company">{detectedCompany}</Row>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs text-[var(--color-text-muted)] shrink-0">
              Company (not detected)
            </label>
            <input
              value={companyName}
              onChange={(e) => onCompanyNameChange(e.target.value)}
              placeholder="e.g. Netflix"
              className="input-base max-w-[220px] py-1.5 text-xs"
            />
          </div>
        )}

        <Row label="Resume">
          <span className="truncate inline-block max-w-full align-bottom">
            {resumeFilename || "—"} · {resumeText.length.toLocaleString()} chars
          </span>
        </Row>
        <Row label="Job description">
          <span className="truncate inline-block max-w-full align-bottom">
            {jobSource || "—"} · {jobDescription.length.toLocaleString()} chars
          </span>
        </Row>
        <Row label="Match report">
          {report ? `${report.overallScore}/100 fit · ${report.items.length} requirements` : "Not analyzed"}
        </Row>
      </div>
    </div>
  );
}
