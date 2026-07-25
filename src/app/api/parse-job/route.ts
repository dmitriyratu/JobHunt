import { NextRequest, NextResponse } from "next/server";
import { parseFileBuffer } from "@/lib/parsers";
import { fetchAndExtractText } from "@/lib/parsers/html";
import { cleanExtractedText } from "@/lib/textClean";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const text = cleanExtractedText(await parseFileBuffer(buffer, file.name, file.type));

      return NextResponse.json({
        text,
        source: file.name,
        sourceType: "file",
        charCount: text.length,
      });
    }

    const body = await request.json();
    const { type, url, text } = body as {
      type: "url" | "text";
      url?: string;
      text?: string;
    };

    if (type === "url") {
      if (!url?.trim()) {
        return NextResponse.json({ error: "URL is required" }, { status: 400 });
      }
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url.trim());
      } catch {
        return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
      }
      const extracted = cleanExtractedText(await fetchAndExtractText(parsedUrl.toString()));
      return NextResponse.json({
        text: extracted,
        source: parsedUrl.toString(),
        sourceType: "url",
        charCount: extracted.length,
      });
    }

    if (type === "text") {
      if (!text?.trim()) {
        return NextResponse.json(
          { error: "Job description text is required" },
          { status: 400 }
        );
      }
      const trimmed = cleanExtractedText(text);
      return NextResponse.json({
        text: trimmed,
        source: "Pasted text",
        sourceType: "text",
        charCount: trimmed.length,
      });
    }

    return NextResponse.json({ error: "Invalid request type" }, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse job description";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
