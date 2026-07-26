import pdf from "pdf-parse";

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
};

type PdfTextContent = {
  items: PdfTextItem[];
};

type PdfPageProxy = {
  getTextContent: (options: {
    normalizeWhitespace: boolean;
    disableCombineTextItems: boolean;
  }) => Promise<PdfTextContent>;
};

// pdf-parse's default renderer joins text items with no separator, only
// breaking lines on a Y-coordinate change. Many PDF generators (resume
// templates especially) emit each word as its own positioned text item with
// no space glyph, relying purely on the horizontal gap for visual spacing —
// that renderer then jams every word together. This reconstructs spaces from
// the gap between the end of one item and the start of the next.
//
// disableCombineTextItems must be true here: pdf.js's own item-combining
// (the false/default setting) merges same-line runs into fewer items using
// its own internal notion of "close enough to be one item" *before* we ever
// see them — for PDFs that encode each word as a separately-positioned run
// with no embedded space glyph, that merge can fuse whole words together
// first, destroying the positional gap our own logic below depends on. Only
// the raw, unmerged per-run items preserve enough position data to rebuild
// spacing reliably.
function renderPageWithSpacing(pageData: PdfPageProxy): Promise<string> {
  return pageData
    .getTextContent({ normalizeWhitespace: true, disableCombineTextItems: true })
    .then((textContent) => {
      let text = "";
      let lastY: number | null = null;
      let lastEndX: number | null = null;

      for (const item of textContent.items) {
        if (!item.str) continue;
        const y = item.transform[5];
        const x = item.transform[4];
        const fontSize = Math.abs(item.transform[0]) || 10;

        if (lastY !== null && y !== lastY) {
          text += "\n";
          lastEndX = null;
        } else if (lastEndX !== null) {
          const gap = x - lastEndX;
          // Real-world word gaps in per-word-item PDFs run closer to 12-15% of
          // font size than a full space-width — measured directly against a
          // resume PDF that was jamming words together at a 25% threshold.
          // Intra-word kerning is near-zero or negative, so this still won't
          // insert spaces inside a word.
          if (gap > fontSize * 0.12 && !/\s$/.test(text)) {
            text += " ";
          }
        }

        text += item.str;
        lastY = y;
        lastEndX = x + (item.width || 0);
      }

      return text;
    });
}

export async function parsePdf(buffer: Buffer): Promise<string> {
  const data = await pdf(buffer, { pagerender: renderPageWithSpacing });
  return data.text.trim();
}
