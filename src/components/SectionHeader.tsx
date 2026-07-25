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
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-overlay)] text-xs font-semibold text-[var(--color-accent)]">
        {step}
      </span>
      <div>
        <h2 className="font-medium text-sm">{title}</h2>
        <p className="text-xs text-[var(--color-text-muted)]">{subtitle}</p>
      </div>
    </div>
  );
}
