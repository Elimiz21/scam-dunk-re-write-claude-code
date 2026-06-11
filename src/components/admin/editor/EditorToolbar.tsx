"use client";

import { Editor, useEditorState } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Quote,
  Minus,
  Link,
  Unlink,
  Image,
  Table,
  Youtube,
  Undo,
  Redo,
  CodeSquare,
  Highlighter,
} from "lucide-react";

interface EditorToolbarProps {
  editor: Editor;
  onImageUpload: () => void;
}

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded-lg transition-colors ${
        isActive
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-6 bg-border mx-1" />;
}

export default function EditorToolbar({
  editor,
  onImageUpload,
}: EditorToolbarProps) {
  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("Enter URL:", previousUrl || "https://");

    if (url === null) return;

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const addYouTubeVideo = () => {
    const url = window.prompt("Enter YouTube or Vimeo URL:");
    if (!url) return;

    // Handle YouTube
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      editor.commands.setYoutubeVideo({ src: url, width: 640, height: 360 });
    } else if (url.includes("vimeo.com")) {
      // For Vimeo, insert as an iframe node using custom embed
      const vimeoId = url.match(/vimeo\.com\/(\d+)/)?.[1];
      if (vimeoId) {
        editor
          .chain()
          .focus()
          .insertContent(
            `<div data-type="embed" data-src="https://player.vimeo.com/video/${vimeoId}"><iframe src="https://player.vimeo.com/video/${vimeoId}" width="640" height="360" frameborder="0" allowfullscreen></iframe></div>`,
          )
          .run();
      }
    } else {
      // Generic embed — only allow validated http(s) URLs and escape them
      // before interpolating so a crafted value can't break out of the
      // attribute and inject markup.
      let safeUrl: string;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return;
        }
        safeUrl = parsed.href;
      } catch {
        return;
      }
      const escaped = safeUrl
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      editor
        .chain()
        .focus()
        .insertContent(
          `<div data-type="embed" data-src="${escaped}"><iframe src="${escaped}" width="640" height="360" frameborder="0" allowfullscreen></iframe></div>`,
        )
        .run();
    }
  };

  const insertTable = () => {
    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
  };

  // TipTap v3 does not re-render on every transaction, so editor.isActive()/
  // editor.can() read inline during render go stale (active highlights and
  // undo/redo disabled states lag a keystroke behind). useEditorState
  // subscribes the toolbar to exactly the slices it shows.
  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      canUndo: ed.can().undo(),
      canRedo: ed.can().redo(),
      isH1: ed.isActive("heading", { level: 1 }),
      isH2: ed.isActive("heading", { level: 2 }),
      isH3: ed.isActive("heading", { level: 3 }),
      isBold: ed.isActive("bold"),
      isItalic: ed.isActive("italic"),
      isUnderline: ed.isActive("underline"),
      isStrike: ed.isActive("strike"),
      isHighlight: ed.isActive("highlight"),
      isCode: ed.isActive("code"),
      isAlignLeft: ed.isActive({ textAlign: "left" }),
      isAlignCenter: ed.isActive({ textAlign: "center" }),
      isAlignRight: ed.isActive({ textAlign: "right" }),
      isAlignJustify: ed.isActive({ textAlign: "justify" }),
      isBulletList: ed.isActive("bulletList"),
      isOrderedList: ed.isActive("orderedList"),
      isBlockquote: ed.isActive("blockquote"),
      isCodeBlock: ed.isActive("codeBlock"),
      isLink: ed.isActive("link"),
    }),
  });

  const iconSize = 16;

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-border bg-secondary/30 rounded-t-2xl">
      {/* Undo / Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!state?.canUndo}
        title="Undo (Ctrl+Z)"
      >
        <Undo size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!state?.canRedo}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo size={iconSize} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={state?.isH1}
        title="Heading 1"
      >
        <Heading1 size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={state?.isH2}
        title="Heading 2"
      >
        <Heading2 size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={state?.isH3}
        title="Heading 3"
      >
        <Heading3 size={iconSize} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Text Formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={state?.isBold}
        title="Bold (Ctrl+B)"
      >
        <Bold size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={state?.isItalic}
        title="Italic (Ctrl+I)"
      >
        <Italic size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={state?.isUnderline}
        title="Underline (Ctrl+U)"
      >
        <Underline size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={state?.isStrike}
        title="Strikethrough"
      >
        <Strikethrough size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        isActive={state?.isHighlight}
        title="Highlight"
      >
        <Highlighter size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={state?.isCode}
        title="Inline Code"
      >
        <Code size={iconSize} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        isActive={state?.isAlignLeft}
        title="Align Left"
      >
        <AlignLeft size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        isActive={state?.isAlignCenter}
        title="Align Center"
      >
        <AlignCenter size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        isActive={state?.isAlignRight}
        title="Align Right"
      >
        <AlignRight size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        isActive={state?.isAlignJustify}
        title="Justify"
      >
        <AlignJustify size={iconSize} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={state?.isBulletList}
        title="Bullet List"
      >
        <List size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={state?.isOrderedList}
        title="Numbered List"
      >
        <ListOrdered size={iconSize} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={state?.isBlockquote}
        title="Blockquote"
      >
        <Quote size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={state?.isCodeBlock}
        title="Code Block"
      >
        <CodeSquare size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        <Minus size={iconSize} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Links */}
      <ToolbarButton
        onClick={setLink}
        isActive={state?.isLink}
        title="Add Link (Ctrl+K)"
      >
        <Link size={iconSize} />
      </ToolbarButton>
      {state?.isLink && (
        <ToolbarButton
          onClick={() => editor.chain().focus().unsetLink().run()}
          title="Remove Link"
        >
          <Unlink size={iconSize} />
        </ToolbarButton>
      )}

      <ToolbarDivider />

      {/* Media */}
      <ToolbarButton onClick={onImageUpload} title="Insert Image">
        <Image size={iconSize} />
      </ToolbarButton>
      <ToolbarButton onClick={addYouTubeVideo} title="Embed Video">
        <Youtube size={iconSize} />
      </ToolbarButton>
      <ToolbarButton onClick={insertTable} title="Insert Table">
        <Table size={iconSize} />
      </ToolbarButton>
    </div>
  );
}
