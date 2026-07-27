import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-6">
      <div className="glass-panel p-8 text-center max-w-md">
        <p className="text-3xl font-semibold text-[var(--color-text-primary)] mb-1">404</p>
        <p className="text-sm text-[var(--color-text-secondary)] mb-5">
          That page doesn&rsquo;t exist. Usage and AI settings now open from the buttons in the
          header.
        </p>
        <Link href="/" className="btn-primary inline-block px-6 py-3">
          Back to resume &amp; job
        </Link>
      </div>
    </div>
  );
}
