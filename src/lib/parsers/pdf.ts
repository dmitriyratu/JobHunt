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
function renderPageWithSpacing(pageData: PdfPageProxy): Promise<string> {
  return pageData
    .getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false })
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
          if (gap > fontSize * 0.25 && !/\s$/.test(text)) {
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
