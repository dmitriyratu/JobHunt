import { NextRequest, NextResponse } from "next/server";
import { parseFileBuffer } from "@/lib/parsers";
import { cleanExtractedText } from "@/lib/textClean";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = cleanExtractedText(await parseFileBuffer(buffer, file.name, file.type));

    if (!text || text.length < 20) {
      return NextResponse.json(
        { error: "Could not extract meaningful text from this file." },
        { status: 422 }
      );
    }

    return NextResponse.json({
      text,
      filename: file.name,
      charCount: text.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse resume";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
