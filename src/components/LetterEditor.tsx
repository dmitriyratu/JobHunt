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
        {/* dvh rather than a flat 500px: on a landscape phone that cap was
            taller than the whole screen, so the toolbar above scrolled out of
            reach as soon as you started typing. */}
        <div className="max-h-[clamp(14rem,60dvh,31rem)] overflow-y-auto bg-[var(--color-surface)] p-4 sm:p-5">
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
      // 40px square wherever the pointer is a finger, 32px where it is a mouse.
      //
      // This was the other way round — 36×40 on a phone shrinking to 28px from
      // `sm:` up — which made the buttons smallest on a tablet, the one device
      // that is both wide and touched. Room was never the constraint above 640:
      // seven 28px buttons occupy 230px of a 680px row.
      //
      // Not the full 44 square: seven of those come to 320px, wider than the
      // card on a 390px phone, and a toolbar that wraps to two rows costs more
      // than the last four pixels of target buy.
      className={`flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] text-sm transition-colors [@media(pointer:fine)]:h-8 [@media(pointer:fine)]:w-8 ${
        active
          ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)]"
      }`}
    >
      {children}
    </button>
  );
}
