import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Feedback delivery.
 *
 * JobHunt deliberately has no database and no required env vars, so there is
 * nowhere to persist this by default. Rather than accept a message and quietly
 * drop it — which looks identical to working, from the sender's side — this
 * route reports honestly whether it was actually delivered anywhere, and the UI
 * offers the text back for copying when it wasn't.
 *
 * Set FEEDBACK_WEBHOOK_URL to any endpoint that accepts a JSON POST (a Slack or
 * Discord incoming webhook, a Zapier catch hook, your own service) and it gets
 * forwarded there.
 */
const WEBHOOK = process.env.FEEDBACK_WEBHOOK_URL;

/** Generous for prose, small enough that a stray paste can't bloat a request. */
const MAX_MESSAGE = 5000;
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024;

type FeedbackRequest = {
  message?: string;
  /** Structural only — never résumé, posting or letter text. See the client. */
  context?: Record<string, unknown>;
  /** data: URL of a single optional screenshot. */
  screenshot?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FeedbackRequest;
    const message = body.message?.trim() ?? "";

    if (!message) {
      return NextResponse.json({ error: "Write a message first." }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE) {
      return NextResponse.json(
        { error: `Please keep it under ${MAX_MESSAGE.toLocaleString()} characters.` },
        { status: 400 }
      );
    }

    const screenshot =
      typeof body.screenshot === "string" && body.screenshot.startsWith("data:image/")
        ? body.screenshot
        : undefined;
    if (screenshot && screenshot.length > MAX_SCREENSHOT_BYTES) {
      return NextResponse.json(
        { error: "That screenshot is too large — please crop it or send it without." },
        { status: 400 }
      );
    }

    const payload = {
      message,
      context: body.context ?? {},
      hasScreenshot: Boolean(screenshot),
      receivedAt: new Date().toISOString(),
    };

    if (!WEBHOOK) {
      // Visible in `vercel logs` / the dev console, but not delivered anywhere
      // the owner would notice. Say so, so the UI can offer a copy instead.
      console.log("[feedback] (not forwarded — FEEDBACK_WEBHOOK_URL unset)", payload);
      return NextResponse.json({ delivered: false });
    }

    const res = await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `text` is what Slack and Discord render; the structured fields sit
      // alongside it for anything that reads JSON properly.
      body: JSON.stringify({
        text: `*JobHunt feedback*\n${message}\n\n\`${JSON.stringify(payload.context)}\``,
        ...payload,
        screenshot,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error("[feedback] webhook rejected", res.status);
      return NextResponse.json({ delivered: false });
    }

    return NextResponse.json({ delivered: true });
  } catch (error) {
    console.error("[feedback] failed", error);
    return NextResponse.json({ delivered: false });
  }
}
