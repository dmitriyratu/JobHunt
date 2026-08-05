"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useJobHuntState } from "@/lib/useAppState";
import { useScrollLock } from "@/lib/useScrollLock";

const PAGE_LABEL: Record<string, string> = {
  "/": "Job Description",
  "/match": "Match Report",
  "/letter": "Write Letter",
};

type Status = "idle" | "sending" | "sent" | "undelivered";

/**
 * Opened from the header's overflow menu, so the trigger lives there and this
 * is controlled from outside. It used to own its own header button; a component
 * that is both an item in a menu and the panel that item opens cannot be either
 * one cleanly.
 */
type Props = {
  open: boolean;
  onClose: () => void;
};

export default function FeedbackModal({ open, onClose }: Props) {
  useScrollLock(open);
  const pathname = usePathname();
  const { state } = useJobHuntState();
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    onClose();
    setStatus("idle");
    setMessage("");
    setScreenshot(null);
    setError("");
    setCopied(false);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  const addImage = useCallback((file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setScreenshot(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }, []);

  /**
   * Deliberately structural only. Which page you were on and whether a report
   * exists is what makes a bug reproducible; your résumé, the posting and the
   * letter are yours and are never attached.
   */
  const context = {
    page: PAGE_LABEL[pathname] ?? pathname,
    hasResume: Boolean(state.resumeText),
    hasJobDescription: Boolean(state.jobDescription),
    hasMatchReport: Boolean(state.matchReport),
    requirementCount: state.matchReport?.items.length ?? 0,
    hasLetter: Boolean(state.generatedBody),
    viewport:
      typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
  };

  async function send() {
    if (!message.trim() || status === "sending") return;
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context, screenshot }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send that.");
        setStatus("idle");
        return;
      }
      setStatus(data.delivered ? "sent" : "undelivered");
      if (data.delivered) setTimeout(close, 1800);
    } catch {
      setStatus("undelivered");
    }
  }

  async function copyForSending() {
    const text = `JobHunt feedback\n\n${message}\n\n---\n${JSON.stringify(context, null, 2)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — select the text above and copy it manually.");
    }
  }

  return (
    <>
      {open && (
        <div
          className="modal-overlay"
          onClick={close}
        >
          <div
            className="modal-panel glass-panel max-w-lg p-0"
            onClick={(e) => e.stopPropagation()}
            onPaste={(e) => {
              const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
              if (item) addImage(item.getAsFile() ?? undefined);
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Send Feedback"
          >
            <div className="modal-head flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-sm font-medium">Send Feedback</h2>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  Tell me what&rsquo;s working or what isn&rsquo;t
                </p>
              </div>
              <button onClick={close} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
                Close
              </button>
            </div>

            <div className="modal-body p-4 sm:p-5">
              {status === "sent" ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-success-muted)] text-2xl text-[var(--color-success)]">
                    ✓
                  </span>
                  <p className="text-sm font-medium">Thanks — that came through.</p>
                  <p className="text-xs text-[var(--color-text-muted)]">Every note gets read.</p>
                </div>
              ) : status === "undelivered" ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning-muted)] p-4">
                    <p className="text-sm font-medium text-[var(--color-warning)]">
                      This app has nowhere to send it yet
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                      Rather than pretend it arrived, here it is to copy and send directly. Nothing
                      was lost.
                    </p>
                  </div>
                  <button onClick={copyForSending} className="btn-primary w-full">
                    {copied ? "Copied!" : "Copy My Feedback"}
                  </button>
                  {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
                  <button onClick={close} className="btn-secondary w-full text-xs">
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <label htmlFor="feedback-message" className="sr-only">
                    Your feedback
                  </label>
                  <textarea
                    id="feedback-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What happened, or what would make this better?"
                    rows={5}
                    className="input-base resize-y"
                    autoFocus
                  />

                  <div className="mt-3">
                    {screenshot ? (
                      <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={screenshot}
                          alt="Attached screenshot"
                          className="h-12 w-12 shrink-0 rounded object-cover"
                        />
                        <span className="min-w-0 flex-1 text-xs text-[var(--color-text-secondary)]">
                          Screenshot attached
                        </span>
                        <button
                          onClick={() => setScreenshot(null)}
                          className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="btn-secondary w-full text-xs"
                      >
                        Add a Screenshot
                      </button>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        addImage(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </div>

                  <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                    Sends which page you were on and whether you had a report — never your resume,
                    the posting, or your letter. A screenshot is included only if you add one.
                  </p>

                  {error && <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>}

                  <button
                    onClick={send}
                    disabled={!message.trim() || status === "sending"}
                    className="btn-primary mt-3 w-full"
                  >
                    {status === "sending" ? "Sending…" : "Send Feedback"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
