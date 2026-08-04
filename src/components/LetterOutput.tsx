"use client";

import LetterEditor from "./LetterEditor";
import SubjectField from "./SubjectField";

type Props = {
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (html: string) => void;
};

export default function LetterOutput({
  subject,
  body,
  onSubjectChange,
  onBodyChange,
}: Props) {
  return (
    // Capped rather than filling the column: this is prose meant to be read,
    // and a line of text 150 characters wide is hard to track back from. The
    // cap is on the panel so the toolbar and the text share one edge.
    //
    // The cap the comment describes had gone missing — `w-full` inside a 1700px
    // container meant the letter ran to about 1550px on a wide window, which is
    // exactly the measure this is meant to prevent. 60rem holds roughly 90
    // characters at the body size.
    <div className="glass-panel w-full max-w-[60rem] p-5 sm:p-6">
      <div className="mb-4">
        <h3 className="font-medium text-sm">Outreach email</h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Skim-optimized for busy hiring managers
        </p>
      </div>

      {body ? (
        <>
          <SubjectField value={subject} onChange={onSubjectChange} />
          {/* The "Email body" label and its Copy button belong to the editor —
              they sit on one line together, the way the subject's do. */}
          <LetterEditor html={body} onChange={onBodyChange} />
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center sm:p-10">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-overlay)]">
            <svg className="h-6 w-6 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            Generate a letter to see the subject and body here
          </p>
        </div>
      )}
    </div>
  );
}
