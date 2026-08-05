import type { AnyNode, Element, Text } from "domhandler";

/**
 * Tags that end a line but don't earn a blank one after them: rows in a list or
 * a table, where the items belong together and a gap between each would read as
 * a series of one-item lists.
 */
const LINE_TAGS = new Set(["li", "tr", "dt", "dd", "option"]);

/**
 * Tags that are their own paragraph — a blank line before and after.
 *
 * This is the set cheerio's `.text()` ignores, and ignoring it is why a scraped
 * posting reads "…in a more authentic way.The Community You Will JoinWe connect
 * Airbnb's community…". Three separate blocks — a paragraph, a heading, the
 * next paragraph — concatenated with nothing between them, so the reader has to
 * work out where one ended from the capital letter mid-word.
 */
const PARAGRAPH_TAGS = new Set([
  "address", "article", "aside", "blockquote", "details", "div", "dl",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4",
  "h5", "h6", "header", "hr", "main", "nav", "ol", "p", "pre", "section",
  "summary", "table", "tbody", "tfoot", "thead", "ul",
]);

/** Never contributes reading text, whatever it happens to contain. */
const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "svg", "head"]);

/**
 * The visible text of a subtree, with the document's block structure kept.
 *
 * The alternative — `.text()` — is why every extracted posting arrived as a
 * wall: it walks the same nodes but emits nothing at the boundaries, so
 * headings weld onto the paragraph above and bullet lists become one run-on
 * sentence. The output here is what a reader would see if they'd copied the
 * page by hand: one line per line, a blank line between paragraphs, and list
 * items marked as list items.
 */
export function blockText(nodes: AnyNode[]): string {
  let out = "";

  // Line breaks are appended to the accumulator rather than pushed onto a list
  // of blocks because the boundaries nest: a </p> inside a <div> inside a <li>
  // would otherwise emit three separators for one gap. Writing into a string
  // and letting the normalize pass collapse runs handles that in one place.
  function newline(count: number) {
    out = out.replace(/[ \t]+$/, "");
    if (!out) return; // no leading blank lines
    const existing = /\n*$/.exec(out)![0].length;
    out += "\n".repeat(Math.max(0, count - existing));
  }

  function visit(node: AnyNode) {
    if (node.type === "text") {
      out += (node as Text).data.replace(/\s+/g, " ");
      return;
    }
    if (node.type !== "tag") return;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;

    if (tag === "br") {
      newline(1);
      return;
    }

    const gap = PARAGRAPH_TAGS.has(tag) ? 2 : LINE_TAGS.has(tag) ? 1 : 0;
    if (gap) newline(gap);

    // A marker, not a hyphen: "- " would be indistinguishable from a dash the
    // posting wrote itself, and the preview needs to tell the two apart to
    // render one as a bullet and leave the other in the sentence.
    if (tag === "li") out += "• ";

    el.children.forEach(visit);

    if (gap) newline(gap);
  }

  nodes.forEach(visit);
  return normalize(out);
}

/**
 * Collapses the serializer's runs into readable text: no trailing space, at
 * most one blank line between blocks, no stray bullet on an empty item.
 */
function normalize(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .map((line) => (line === "•" ? "" : line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
