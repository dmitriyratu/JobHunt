/**
 * The step heading that opens every page's main section.
 *
 * The number is tinted rather than grey: it is the one place the journey's
 * position is stated in the content column, and at 24px a grey disc read as
 * decoration. Title and subtitle are a clear two steps apart in both size and
 * weight, which is what lets the subtitle be skipped by anyone who already
 * knows the page.
 */
export default function SectionHeader({
  step,
  title,
  subtitle,
}: {
  step: number;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-muted)] text-xs font-semibold text-[var(--color-accent)]">
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-semibold leading-snug tracking-[-0.01em]">
          {title}
        </h2>
        <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{subtitle}</p>
      </div>
    </div>
  );
}
