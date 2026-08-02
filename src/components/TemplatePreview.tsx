"use client";

import { specsFor } from "@/lib/documentShape";
import type { SectionSpec } from "@/lib/documentShape";
import type { DocumentShape } from "@/types";

/**
 * A miniature of what a document shape actually looks like on the page.
 *
 * Greeked rather than typeset: bars stand in for words, so the eye reads the
 * *arrangement* — what comes first, how dense it is, how long it runs — which
 * is the only thing the choice actually turns on. Rendering real sample text at
 * this size would just be unreadable text, and would invite comparing the
 * writing instead of the format.
 *
 * The sections come from specsFor(), the same source the renderer uses. That is
 * the point: the preview cannot promise a layout the document doesn't produce,
 * and adding a section to documentShape.ts updates this automatically.
 */

type Props = {
  shape: DocumentShape;
  /** Dims the sheet when its card isn't the selected one. */
  muted?: boolean;
};

/*
 * Drawn in the paper tokens, not the theme's text colours.
 *
 * The sheet below is deliberately white in both themes — it is a preview of a
 * printed page, and a resume does not turn dark because the app did. Greeking
 * it in --color-text-* meant the bars went near-white on a white sheet in dark
 * mode, and the whole preview vanished.
 */
const BAR = "rounded-[1px]";
const INK = "bg-[var(--color-paper-ink)]";
const MID = "bg-[var(--color-paper-ink-2)]";
const FAINT = "bg-[var(--color-paper-ink-3)]";

function Line({ w, tone = "faint", h = 2 }: { w: string; tone?: "ink" | "mid" | "faint"; h?: number }) {
  const bg = tone === "ink" ? INK : tone === "mid" ? MID : FAINT;
  return (
    <div
      className={`${BAR} ${bg} ${tone === "faint" ? "opacity-40" : "opacity-70"}`}
      style={{ width: w, height: h }}
    />
  );
}

function BulletRow({ w }: { w: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className={`${FAINT} h-[2px] w-[2px] rounded-full opacity-60`} />
      <Line w={w} />
    </div>
  );
}

/**
 * A row on the document's grid: a short date-ish bar in the left column, the
 * content in the right. Every layout except prose sets on this grid, which is
 * the single most recognisable thing about the template.
 */
function GridRow({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1">
      <div className="shrink-0" style={{ width: "22%" }}>
        {label ? <Line w={label} tone="mid" /> : null}
      </div>
      <div className="min-w-0 flex-1 space-y-[3px]">{children}</div>
    </div>
  );
}

/** One section's body, drawn the way that layout actually sets. */
function SectionBody({ spec }: { spec: SectionSpec }) {
  if (spec.layout === "prose") {
    return (
      <div className="space-y-[3px]">
        <Line w="100%" />
        <Line w="88%" />
      </div>
    );
  }

  // keywords — \labeled rows: muted label in the left column, value in the right
  if (spec.layout === "keywords") {
    return (
      <div className="space-y-[3px]">
        {["62%", "48%"].map((w, i) => (
          <GridRow key={i} label={i === 0 ? "70%" : "54%"}>
            <Line w={w} />
          </GridRow>
        ))}
      </div>
    );
  }

  // list — numbered for citations, a plain indented column for everything else
  if (spec.layout === "list") {
    const numbered = spec.listStyle === "numbered";
    return (
      <div className="space-y-[3px]">
        {["76%", "68%"].map((w, i) =>
          numbered ? (
            <GridRow key={i}>
              <BulletRow w={w} />
            </GridRow>
          ) : (
            <GridRow key={i}>
              <Line w={w} />
            </GridRow>
          )
        )}
      </div>
    );
  }

  // entries — the date column plus the heading/organisation/bullets stack
  return (
    <div className="space-y-[5px]">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-[3px]">
          <GridRow label={i === 0 ? "76%" : "62%"}>
            <Line w={i === 0 ? "58%" : "50%"} tone="ink" h={3} />
            <Line w="44%" tone="mid" />
            <BulletRow w="96%" />
            <BulletRow w="82%" />
          </GridRow>
        </div>
      ))}
    </div>
  );
}

export default function TemplatePreview({ shape, muted = false }: Props) {
  const specs = specsFor(shape);
  // Required sections first, because those are the ones the document is
  // guaranteed to contain. The catalogue is deliberately larger than any single
  // document uses, so previewing it in catalogue order would promise optional
  // sections that this posting may well not produce.
  const shown = [...specs].sort((a, b) => Number(b.core) - Number(a.core)).slice(0, 5);
  const overflows = specs.length > shown.length;

  return (
    <div
      aria-hidden
      className={`relative overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-paper)] shadow-[var(--shadow-sm)] transition-opacity ${
        muted ? "opacity-55" : "opacity-100"
      }`}
      style={{ aspectRatio: "8.5 / 11" }}
    >
      <div className="space-y-[7px] p-[9px]">
        {/* Header — name and headline left, contact details right, over a rule */}
        <div className="flex items-end justify-between gap-2 pb-[2px]">
          <div className="flex flex-col gap-[3px]" style={{ width: "56%" }}>
            <Line w="82%" tone="ink" h={5} />
            <Line w="64%" tone="mid" />
            <Line w="38%" />
          </div>
          <div className="flex flex-col items-end gap-[2px]" style={{ width: "40%" }}>
            <Line w="86%" />
            <Line w="60%" />
            <Line w="74%" />
          </div>
        </div>
        <div className={`${FAINT} h-[1px] w-full opacity-50`} />

        {shown.map((spec) => (
          <div key={spec.key} className="space-y-[3px]">
            {/* The one thing set as real text. Greeked, the two shapes read as
                the same stack of grey bars — but the difference between them
                IS the headings and their order, so those have to be legible.
                Deliberately off-scale: at true proportion a section heading
                would be under 3px here and unreadable. */}
            <div className="text-[6.5px] font-bold uppercase leading-none tracking-[0.06em] text-[color:var(--color-paper-ink)]">
              {spec.title}
            </div>
            <div className={`${FAINT} h-[1px] w-full opacity-30`} />
            <div className="pt-[2px]">
              <SectionBody spec={spec} />
            </div>
          </div>
        ))}
      </div>

      {overflows && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--color-paper)] to-transparent" />
      )}
    </div>
  );
}
