"use client";

import { useMemo, useState } from "react";
import { SHAPE_DEFS } from "@/lib/documentShape";
import {
  ALL_LINK_KINDS,
  LINK_DEF,
  getLink,
  setLink,
  type LinkKind,
} from "@/lib/profileLinks";
import { formatPhone, type ResumeProfile } from "@/lib/settings";
import type { DocumentShape } from "@/types";

/**
 * The contact block that heads every generated resume.
 *
 * Shared by the profile dialog and the generate flow rather than duplicated:
 * they edit the same values, and two copies of this form would drift the moment
 * a field is added.
 *
 * The links half is driven by the document shape. Which slots appear is the
 * whole point — the fixed "Website or GitHub" field this replaced asked a
 * physician for a GitHub account and left them nowhere to put an NPI. What is
 * shown is the union of the shape's suggestions and everything already filled
 * in, so switching shapes never hides a value: a saved GitHub stays visible and
 * keeps printing even on a document that didn't suggest it.
 */

const SCALAR_FIELDS: {
  key: "fullName" | "headline" | "email" | "phone" | "location";
  label: string;
  placeholder: string;
  type?: string;
  /**
   * Tidies the value once you leave the field.
   *
   * On blur rather than per keystroke: formatting mid-entry means moving the
   * caret out from under someone who is still typing, and this is a field you
   * fill once. Any formatter here must return unfamiliar input unchanged.
   */
  onBlur?: (value: string) => string;
}[] = [
  { key: "fullName", label: "Full name", placeholder: "Dmitriy Ratushny" },
  { key: "headline", label: "Headline (optional)", placeholder: "Senior Backend Engineer" },
  { key: "email", label: "Email", placeholder: "you@example.com", type: "email" },
  {
    key: "phone",
    label: "Phone",
    placeholder: "(416) 555-0199",
    type: "tel",
    onBlur: formatPhone,
  },
  { key: "location", label: "Location", placeholder: "Toronto, ON" },
];

type Props = {
  value: ResumeProfile;
  onChange: (next: ResumeProfile) => void;
  /**
   * Which document this profile is about to head, used only to decide which
   * link slots are offered. Defaults to "resume" where nothing has been chosen.
   */
  shape?: DocumentShape;
  /** Distinguishes the input ids when two instances could ever coexist. */
  idPrefix?: string;
};

export default function ProfileFields({
  value,
  onChange,
  shape = "resume",
  idPrefix = "profile",
}: Props) {
  const [added, setAdded] = useState<LinkKind[]>([]);

  // Suggested, plus anything added by hand this session, minus anything
  // dismissed — then anything with a value, unconditionally, because a link
  // that prints must stay editable. Catalogue order throughout, so the list
  // never reshuffles as values are typed.
  const shownKinds = useMemo(() => {
    const hidden = new Set(value.hiddenLinks);
    const wanted = new Set<LinkKind>(
      [...SHAPE_DEFS[shape].suggestedLinks, ...added].filter((k) => !hidden.has(k))
    );
    for (const l of value.links) if (l.value.trim()) wanted.add(l.kind);
    return ALL_LINK_KINDS.filter((k) => wanted.has(k));
  }, [shape, value.links, value.hiddenLinks, added]);

  const remaining = ALL_LINK_KINDS.filter((k) => !shownKinds.includes(k));

  /** Clears the value and stops the slot being offered again. */
  function dismiss(kind: LinkKind) {
    setAdded((prev) => prev.filter((k) => k !== kind));
    onChange({
      ...value,
      links: setLink(value.links, kind, ""),
      hiddenLinks: value.hiddenLinks.includes(kind)
        ? value.hiddenLinks
        : [...value.hiddenLinks, kind],
    });
  }

  function restore(kind: LinkKind) {
    setAdded((prev) => (prev.includes(kind) ? prev : [...prev, kind]));
    onChange({ ...value, hiddenLinks: value.hiddenLinks.filter((k) => k !== kind) });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SCALAR_FIELDS.map(({ key, label, placeholder, type, onBlur }) => (
          <div key={key}>
            <label
              htmlFor={`${idPrefix}-${key}`}
              className="mb-1.5 block text-xs font-medium text-[var(--color-text-secondary)]"
            >
              {label}
            </label>
            <input
              id={`${idPrefix}-${key}`}
              type={type ?? "text"}
              value={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              onBlur={
                onBlur
                  ? (e) => {
                      const tidied = onBlur(e.target.value);
                      if (tidied !== value[key]) onChange({ ...value, [key]: tidied });
                    }
                  : undefined
              }
              placeholder={placeholder}
              className="input-base text-sm"
              autoComplete="off"
            />
          </div>
        ))}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
          Links and IDs
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shownKinds.map((kind) => {
            const def = LINK_DEF[kind];
            return (
              <div key={kind}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label
                    htmlFor={`${idPrefix}-link-${kind}`}
                    className="block text-xs font-medium text-[var(--color-text-secondary)]"
                  >
                    {def.label}
                  </label>
                  {/* Removing a field is a form action, not a document one —
                      nothing is lost that retyping wouldn't restore, and the
                      chip below puts the slot straight back — so it doesn't
                      ask for confirmation. */}
                  <button
                    type="button"
                    onClick={() => dismiss(kind)}
                    aria-label={`Remove ${def.label}`}
                    title={`Remove ${def.label}`}
                    className="-m-1 rounded p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-overlay)] hover:text-[var(--color-text-secondary)]"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <input
                  id={`${idPrefix}-link-${kind}`}
                  type="text"
                  value={getLink(value.links, kind)}
                  onChange={(e) =>
                    onChange({ ...value, links: setLink(value.links, kind, e.target.value) })
                  }
                  placeholder={def.placeholder}
                  className="input-base text-sm"
                  autoComplete="off"
                />
              </div>
            );
          })}
        </div>

        {remaining.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[var(--color-text-muted)]">Add:</span>
            {remaining.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => restore(kind)}
                className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-text-muted)] hover:bg-[var(--color-surface-overlay)]"
              >
                + {LINK_DEF[kind].label}
              </button>
            ))}
          </div>
        )}

        <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
          Everything you fill in here prints, on every document type. Leave a field blank to
          keep it off the page.
        </p>
      </div>
    </div>
  );
}
