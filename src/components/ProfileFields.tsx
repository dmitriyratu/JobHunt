"use client";

import { formatPhone, type ResumeProfile } from "@/lib/settings";

/**
 * The contact block that heads every generated resume.
 *
 * Shared by Settings and the generate flow rather than duplicated: they edit
 * the same seven values, and two copies of this form would drift the moment a
 * field is added to ResumeProfile.
 */

export const PROFILE_FIELDS: {
  key: keyof ResumeProfile;
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
  {
    key: "headline",
    label: "Headline (optional)",
    placeholder: "Senior Backend Engineer",
  },
  { key: "email", label: "Email", placeholder: "you@example.com", type: "email" },
  {
    key: "phone",
    label: "Phone",
    placeholder: "(416) 555-0199",
    type: "tel",
    onBlur: formatPhone,
  },
  { key: "location", label: "Location", placeholder: "Toronto, ON" },
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/yourname" },
  { key: "website", label: "Website or GitHub", placeholder: "github.com/yourname" },
];

type Props = {
  value: ResumeProfile;
  onChange: (next: ResumeProfile) => void;
  /** Distinguishes the input ids when two instances could ever coexist. */
  idPrefix?: string;
};

export default function ProfileFields({ value, onChange, idPrefix = "profile" }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {PROFILE_FIELDS.map(({ key, label, placeholder, type, onBlur }) => (
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
  );
}
