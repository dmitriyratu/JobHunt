"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { copyRichText } from "@/lib/copyToClipboard";

type Props = {
  html: string;
  onChange: (html: string) => void;
};

export default function LetterEditor({ html, onChange }: Props) {
  const [copied, setCopied] = useState(false);
  // Tracks the last HTML that crossed this boundary in either direction.
  // Comparing against editor.getHTML() directly is unreliable — TipTap
  // normalizes markup, so an exact round-trip isn't guaranteed and a false
  // mismatch would reset the caret mid-typing.
  const lastHtmlRef = useRef(html);

  const editor = useEditor({
    extensions: [StarterKit],
    content: html,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const next = editor.getHTML();
      lastHtmlRef.current = next;
      onChange(next);
    },
    editorProps: {
      attributes: {
        class: "letter-editor-content text-sm leading-relaxed focus:outline-none",
      },
    },
  });

  // Re-sync only when `html` changes from outside (a fresh generation
  // replacing the whole letter), never on the editor's own echo.
  useEffect(() => {
    if (!editor) return;
    if (html !== lastHtmlRef.current) {
      lastHtmlRef.current = html;
      editor.commands.setContent(html, { emitUpdate: false });
    }
  }, [html, editor]);

  async function handleCopy() {
    if (!editor) return;
    await copyRichText(editor.getHTML(), editor.getText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!editor) {
    return (
      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-5 h-40" />
    );
  }

  return (
    <>
      {/* Label and Copy on one line above the box, matching the subject field
          directly above it. Copy used to ride the toolbar, which is what made
          that row too wide for a phone. */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[var(--color-text-secondary)]">Email body</p>
        <button onClick={handleCopy} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="rounded-lg border border-[var(--color-border-subtle)] overflow-hidden">
      {/* Tools only, and no justify-between.
          Seven buttons plus a Copy pushed apart to the panel's edges came to
          more than a 390px phone has, so the row overflowed its own card and
          dropped Copy onto a second line. Copy now sits with the "Email body"
          label above the editor — the same place the subject's does — and what
          is left is a plain, tight run of tools that fits. */}
      <div className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-2 py-1.5 sm:px-3 sm:py-2">
        <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
          <ToolbarButton
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            label="Bold"
          >
            <span className="font-bold">B</span>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            label="Italic"
          >
            <span className="italic">I</span>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            label="Underline"
          >
            <span className="underline">U</span>
          </ToolbarButton>
          <Divider />
          <ToolbarButton
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            label="Bullet list"
          >
            •
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            label="Numbered list"
          >
            1.
          </ToolbarButton>
          <Divider />
          <ToolbarButton onClick={() => editor.chain().focus().undo().run()} label="Undo">
            ↶
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()} label="Redo">
            ↷
          </ToolbarButton>
        </div>
      </div>
        <div className="bg-[var(--color-surface)] p-4 sm:p-5 max-h-[500px] overflow-y-auto">
          <EditorContent editor={editor as Editor} />
        </div>
      </div>
    </>
  );
}

/** Grouping, and the first thing to go: on a phone the seven buttons need
 *  every pixel of the row, and losing two hairlines costs nothing a gap
 *  doesn't already say. */
function Divider() {
  return <div className="mx-1 hidden h-5 w-px shrink-0 bg-[var(--color-border)] sm:block" />;
}

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      // 36×40 on a phone, 28px from sm: up. Seven of these sit in a row above
      // the email body, and at 28px they are a thumb-width apart on a touch
      // screen — under both the Apple HIG target and what WCAG 2.5.8 asks for.
      // Not the full 44 square: seven of those are wider than the card on a
      // 360px phone, and a toolbar that wraps to two rows costs more than the
      // last few pixels of target buy. Mobile-first rather than a
      // pointer-coarse variant so the size is decided by available room, which
      // is the thing that actually varies.
      className={`h-10 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded text-sm transition-colors ${
        active
          ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)]"
      }`}
    >
      {children}
    </button>
  );
}
