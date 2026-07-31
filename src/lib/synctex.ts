/**
 * SyncTeX: turning a click on the PDF back into a line of LaTeX.
 *
 * Compilation is lossy in the direction we need — a PDF has glyphs at
 * coordinates and no memory of the source that produced them — so the engine is
 * asked to record the correspondence as it goes. Tectonic writes it with
 * --synctex, and this reads it back.
 *
 * The format is a flat text log. A header names the input files and the unit
 * scale, then `Content:` holds one line per typeset box, nested between page
 * markers:
 *
 *     {1                              page 1 opens
 *     [1,207:4736286,42152897:...     vbox from file 1, source line 207
 *     (1,207:...                      hbox
 *     x1,207:5150000,41000000         a glyph
 *     ]                               box closes
 *     }1                              page 1 closes
 *
 * Only two things matter here: which source line a box came from, and where it
 * sits on the page. Everything else — nesting, kerns, glue, form references —
 * is read past.
 */

/** One typeset box: where it landed, and the source line it came from. */
type Box = {
  line: number;
  /** PDF points from the left edge. */
  x: number;
  /** PDF points from the TOP edge — SyncTeX measures downward, unlike PDF. */
  y: number;
  w: number;
  /** Height above the baseline. */
  h: number;
  /** Depth below the baseline. */
  d: number;
};

export type SyncTexIndex = {
  /** Boxes per page, 1-based page numbers. */
  pages: Map<number, Box[]>;
};

/**
 * SyncTeX units per PDF point.
 *
 * TeX counts in scaled points, 65536 to the TeX point, and a TeX point is
 * 1/72.27in against the PDF's 1/72in. 65536 × 72.27 / 72 is where the number
 * comes from; it is not arbitrary and must not be rounded.
 */
const UNITS_PER_PT = 65781.76;

/**
 * Records carrying a position. The leading character is the box type:
 * [ and ( open a vbox/hbox, v and h are void ones, and x/k/g/$ are a glyph,
 * kern, glue or maths node. All share the `tag,line:x,y` prefix; the box types
 * add `:width,height,depth`.
 *
 * A record may be `tag,line,column`, so the column is matched and discarded.
 */
const RECORD = /^([[(vhxkg$])(\d+),(\d+)(?:,\d+)?:(-?\d+),(-?\d+)(?::(-?\d+),(-?\d+),(-?\d+))?/;

export function parseSyncTex(raw: string): SyncTexIndex {
  const pages = new Map<number, Box[]>();
  if (!raw) return { pages };

  // Header. Defaults are what Tectonic emits for our documents; parsed anyway
  // so a different engine or a magnified document doesn't silently mis-locate.
  const num = (key: string, fallback: number) => {
    const m = raw.match(new RegExp(`^${key}:(-?[\\d.]+)$`, "m"));
    const v = m ? Number(m[1]) : NaN;
    return Number.isFinite(v) ? v : fallback;
  };
  const unit = num("Unit", 1);
  const magnification = num("Magnification", 1000) / 1000;
  const xOffset = num("X Offset", 0);
  const yOffset = num("Y Offset", 0);

  const toPt = (v: number, offset: number) => (v * unit + offset) / UNITS_PER_PT / magnification;

  const body = raw.slice(raw.indexOf("\nContent:") + 1);
  let page = 0;

  for (const rawLine of body.split("\n")) {
    if (!rawLine) continue;

    // `{N` opens page N, `}N` closes it. `!` is a character-count record and
    // everything else at this level is a box.
    const first = rawLine[0];
    if (first === "{") {
      page = Number(rawLine.slice(1)) || 0;
      continue;
    }
    if (first === "}") {
      page = 0;
      continue;
    }
    if (page === 0) continue;

    const m = RECORD.exec(rawLine);
    if (!m) continue;

    const line = Number(m[3]);
    // Line 0 means "no source line known", which is true of a lot of internal
    // boxes. Pointing the editor at line 0 is worse than not answering.
    if (!line) continue;

    const box: Box = {
      line,
      x: toPt(Number(m[4]), xOffset),
      y: toPt(Number(m[5]), yOffset),
      w: m[6] ? toPt(Number(m[6]), 0) : 0,
      h: m[7] ? toPt(Number(m[7]), 0) : 0,
      d: m[8] ? toPt(Number(m[8]), 0) : 0,
    };

    const list = pages.get(page);
    if (list) list.push(box);
    else pages.set(page, [box]);
  }

  return { pages };
}

/**
 * The source line for a point on a page, or null if nothing is close.
 *
 * Boxes that contain the point win, smallest first — the innermost box is the
 * most specific answer, and an enclosing vbox for a whole section would
 * otherwise swallow every click inside it. When nothing contains the point, the
 * nearest box within a tolerance is used instead, so clicking the white space
 * just right of a line still finds that line rather than giving up.
 */
export function lineAt(
  index: SyncTexIndex,
  page: number,
  xPt: number,
  yPt: number
): number | null {
  const boxes = index.pages.get(page);
  if (!boxes?.length) return null;

  let contained: Box | null = null;
  let containedArea = Infinity;
  let nearest: Box | null = null;
  let nearestDist = Infinity;

  for (const b of boxes) {
    // Normalised, because a negative width is legal and would invert the test.
    const left = Math.min(b.x, b.x + b.w);
    const right = Math.max(b.x, b.x + b.w);
    const top = b.y - b.h;
    const bottom = b.y + b.d;

    const dx = xPt < left ? left - xPt : xPt > right ? xPt - right : 0;
    const dy = yPt < top ? top - yPt : yPt > bottom ? yPt - bottom : 0;

    if (dx === 0 && dy === 0) {
      // A glyph record has no extent; treat it as the most specific thing there
      // is so it beats any box that also contains the point.
      const area = Math.max(right - left, 0.01) * Math.max(bottom - top, 0.01);
      if (area < containedArea) {
        containedArea = area;
        contained = b;
      }
      continue;
    }

    // Vertical distance dominates: the line above is a worse answer than
    // something further along the line you actually clicked.
    const dist = dy * 4 + dx;
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = b;
    }
  }

  if (contained) return contained.line;
  // ~half an inch. Beyond that the click was not really aimed at anything.
  return nearest && nearestDist < 36 ? nearest.line : null;
}
