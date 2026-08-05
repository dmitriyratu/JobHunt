import type { JobFactKey } from "@/types";

/**
 * One 16px stroke glyph per fact.
 *
 * Drawn inline rather than pulled from a set: this app ships no icon library,
 * and ten paths weigh less than adding one. Every glyph is on the same 24-unit
 * grid with the same 1.8 stroke so a row of them reads as one family.
 */

const PATHS: Record<JobFactKey, React.ReactNode> = {
  salary: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.5 9.5A2.5 2.5 0 0 0 12 8h-.2a2 2 0 0 0-.3 3.97l1.2.18A2 2 0 0 1 12.4 16H12a2.5 2.5 0 0 1-2.5-1.5M12 6.5v11" />
    </>
  ),
  location: (
    <>
      <path d="M12 21s6.5-5.6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.4 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.4" />
    </>
  ),
  workplace: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 10v9.5h13V10" />
      <path d="M10 19.5v-5h4v5" />
    </>
  ),
  employment: (
    <>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 12.5h17" />
    </>
  ),
  seniority: (
    <>
      <path d="M4 19.5h16" />
      <path d="M6.5 19.5v-5h3.5v5M13.5 19.5V9H17v10.5" />
      <path d="m10 8 2-3.5L14 8" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 6.4a3 3 0 0 1 0 5.2M17.5 14.9c1.9.6 3 2.4 3 4.6" />
    </>
  ),
  posted: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.2 2" />
    </>
  ),
  deadline: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3.5v4M16 3.5v4" />
      <path d="m9.5 15 1.8 1.8L15 13" />
    </>
  ),
  visa: (
    <>
      <path d="M12 3.5 5 6.2v5.4c0 4 2.9 7.6 7 8.9 4.1-1.3 7-4.9 7-8.9V6.2Z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </>
  ),
  travel: (
    <>
      <path d="M3.5 14.5 20 6l-3.2 6.4-3.4 1 .6 5.6-2 1.4-1.8-4.6Z" />
    </>
  ),
};

export default function FactIcon({
  name,
  className = "h-3.5 w-3.5",
}: {
  name: JobFactKey;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
