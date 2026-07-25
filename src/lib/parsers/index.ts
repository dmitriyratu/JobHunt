import { parseDocx } from "./docx";
import { parsePdf } from "./pdf";

const TEXT_EXTENSIONS = new Set(["txt", "md", "rtf"]);

export async function parseFileBuffer(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const mime = mimeType?.toLowerCase() ?? "";

  if (mime.includes("pdf") || ext === "pdf") {
    return parsePdf(buffer);
  }

  if (
    mime.includes("wordprocessingml") ||
    mime.includes("msword") ||
    ext === "docx" ||
    ext === "doc"
  ) {
    if (ext === "doc") {
      throw new Error(
        "Legacy .doc format is not supported. Save as .docx or PDF and try again."
      );
    }
    return parseDocx(buffer);
  }

  if (
    mime.startsWith("text/") ||
    TEXT_EXTENSIONS.has(ext)
  ) {
    return buffer.toString("utf-8").trim();
  }

  throw new Error(
    `Unsupported file type (.${ext}). Upload PDF, DOCX, or plain text.`
  );
}
