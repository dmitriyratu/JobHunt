"use client";

import type { SeededField } from "@/lib/contactExtract";
import { isProfileUsable, type ResumeProfile } from "@/lib/settings";
import ProfileFields from "./ProfileFields";
import type { AssertedFact, DocumentShape } from "@/types";

/**
 * The contact block that heads every generated document.
 *
 * Filled in from your resume the moment one is read — see @/lib/contactExtract
 * — and then owned by you. That extraction used to announce itself in a modal
 * of its own; now that uploading happens two tabs away it announces itself
 * here, as a banner over the fields it changed, which is both where the values
 * are and where they can be corrected.
 *
 * Showing it at all is the point. The extraction has always run, silently, and
 * that made it invisible in the two ways that matter: nobody knew the app
 * already had their phone number, and nobody saw the values it got wrong —
 * which is exactly where a PDF's contact block mangles worst, with ligatures in
 * an email, a phone number run together with the line above, a LinkedIn URL
 * split across two spans.
 */

type Props = {
  draft: ResumeProfile;
  onDraftChange: (next: ResumeProfile) => void;
  /** Decides which link slots the form offers; null before one is picked. */
  shape: DocumentShape | null;
  /**
   * What the last upload read, if it hasn't been acknowledged yet. Null on an
   * ordinary visit — most of the time this tab is just a form.
   */
  found: SeededField[] | null;
  onSave: () => void;
  saved: boolean;
  facts: AssertedFact[];
  onRemoveFact: (id: string) => void;
};

export default function DetailsTab({
  draft,
  onDraftChange,
  shape,
  found,
  onSave,
  saved,
  facts,
  onRemoveFact,
}: Props) {
  // Called out separately from additions: filling a blank needs no scrutiny,
  // while changing or dropping a value you set by hand is the one thing worth
  // making impossible to miss.
  const displaced = found?.filter((f) => f.previous).length ?? 0;

  return (
    <div className="space-y-4">
      {/* One line where there were four. The paragraph this replaces explained
          that the model never writes these, that PDF extraction mangles phone
          numbers, and that a correction sticks — all true, none of it needed
          before you have looked at the fields. What is worth saying up front is
          where these end up; the rest is either visible in the values or told
          by the banner below, which only appears when there is a reason. */}
      <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
        These head every document JobHunt writes for you, read from your resume. Fix anything
        wrong and it stays fixed.
      </p>

      {found && (
        <div className="rounded-[var(--radius-sm)] border border-[var(--color-accent)]/40 bg-[var(--color-accent-muted)] px-3 py-2.5">
          {found.length > 0 ? (
            <>
              <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                Read out of the resume you just uploaded.
              </p>
              {displaced > 0 && (
                <p className="mt-2 text-xs text-[var(--color-warning)]">
                  {displaced === 1
                    ? "One changes a value already on file."
                    : `${displaced} change values already on file.`}{" "}
                  Nothing is saved until you press Save Details.
                </p>
              )}
              {/* Names what this upload contributed. The form below shows the
                  values but not their provenance, and a field the extraction
                  invented reads exactly like one you typed last week. */}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {found.map((f) => (
                  <span
                    key={f.label}
                    title={f.previous ? `${f.value || "cleared"} — was ${f.previous}` : f.value}
                    // Wraps rather than truncating: on a phone a chip gets about
                    // 25 characters, and an extracted LinkedIn URL — exactly the
                    // field most worth checking — was ellipsised down to
                    // "linkedin: https://www…" with no tooltip to reveal the
                    // rest, because a touch screen has no hover.
                    className={`max-w-full break-words rounded-[var(--radius-control)] border px-2.5 py-1 text-[11px] ${
                      f.previous
                        ? "border-[var(--color-warning)]/40 bg-[var(--color-warning-muted)] text-[var(--color-text-secondary)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface-overlay)] text-[var(--color-text-secondary)]"
                    }`}
                  >
                    <span className="text-[var(--color-text-muted)]">{f.label}:</span>{" "}
                    {/* An empty value is a removal — this resume does not carry
                        the field at all, so say that rather than render a gap. */}
                    {f.value || <span className="italic">cleared</span>}
                    {f.previous && (
                      <span className="text-[var(--color-text-muted)]"> (was {f.previous})</span>
                    )}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
              Your new resume&rsquo;s details were already on file — nothing below changed.
            </p>
          )}
        </div>
      )}

      <ProfileFields value={draft} onChange={onDraftChange} shape={shape ?? "resume"} />

      {!isProfileUsable(draft) && (
        <p className="text-xs text-[var(--color-warning)]">
          A name and at least one way to reach you are required.
        </p>
      )}

      <button onClick={onSave} className="btn-primary w-full">
        {saved ? "Saved!" : "Save Details"}
      </button>

      {/* Under the button rather than above it, and half the length. Privacy is
          worth stating once; stating it between the form and the button it
          belongs to made it the last thing read before saving, which is where
          the eye is looking for confirmation, not caveats. */}
      <p className="text-center text-[11px] text-[var(--color-text-muted)]">
        Saved in this browser only.
      </p>

      <div className="border-t border-[var(--color-border-subtle)] pt-4">
        <AssertedFactList facts={facts} onRemove={onRemoveFact} />
      </div>
    </div>
  );
}

/**
 * The facts you told the chat, listed so they can be taken back.
 *
 * There is no way to add one here on purpose. These are captured in
 * conversation, where the app can see the claim in context and you can see what
 * it will do with it; a free-text box would be a second, blinder way in — and
 * whatever is typed into it goes onto a resume you send to an employer.
 *
 * Removing is different. A claim that was true of the job you were chasing in
 * March may not be one you want on every application forever, and the only
 * thing worse than not being able to state a fact is not being able to withdraw
 * one. Applies immediately rather than on Save: this is a list with a delete
 * button, not a form, and a removal that silently depended on a button further
 * up the dialog would be the kind of thing you find out about later.
 */
function AssertedFactList({
  facts,
  onRemove,
}: {
  facts: AssertedFact[];
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium">Facts you&rsquo;ve added</h3>
      {/* Kept when the list is empty, and only then, so the pointer the chat
          gives you ("remove it any time under Your Profile") lands on something
          that explains itself. Once there are facts the list says what they are
          better than a paragraph about them could. */}
      {facts.length === 0 ? (
        <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
          Nothing yet. When the match report chat offers to remember something your resume
          doesn&rsquo;t say, it lands here.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {facts.map((fact) => (
            <li
              key={fact.id}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-3 py-2"
            >
              {/* break-words: a stated fact can be a URL or a long token, and
                  `min-w-0` alone only lets the box shrink — it doesn't give the
                  text anywhere to break. */}
              <span className="min-w-0 break-words text-xs text-[var(--color-text-secondary)]">
                {fact.text}
              </span>
              <button
                type="button"
                onClick={() => onRemove(fact.id)}
                aria-label={`Remove "${fact.text}"`}
                className="tap inline-flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-danger)]"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
