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
    <div className="rounded-lg border border-[var(--color-border-subtle)] overflow-hidden">
      {/* Wraps rather than overflowing: seven tool buttons plus Copy are a few
          pixels wider than a phone screen. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-1">
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
        <button onClick={handleCopy} className="btn-secondary text-xs py-1.5 px-3 shrink-0">
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="bg-[var(--color-surface)] p-4 sm:p-5 max-h-[500px] overflow-y-auto">
        <EditorContent editor={editor as Editor} />
      </div>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-[var(--color-border)] mx-1" />;
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
      // 44px on a phone, 28px from sm: up. Seven of these sit in a row under
      // the email body, and at 28px they are a thumb-width apart on a touch
      // screen — under both the Apple HIG target and what WCAG 2.5.8 asks for.
      // Mobile-first rather than a pointer-coarse variant so the size is
      // decided by available room, which is the thing that actually varies.
      className={`h-11 w-11 sm:h-7 sm:w-7 flex items-center justify-center rounded text-sm transition-colors ${
        active
          ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-overlay)]"
      }`}
    >
      {children}
    </button>
  );
}
