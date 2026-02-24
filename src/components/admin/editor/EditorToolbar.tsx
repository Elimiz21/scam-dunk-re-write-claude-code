"use client";

import { Editor } from "@tiptap/react";
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

export default function EditorToolbar({ editor, onImageUpload }: EditorToolbarProps) {
    const setLink = () => {
        const previousUrl = editor.getAttributes("link").href;
        const url = window.prompt("Enter URL:", previousUrl || "https://");

        if (url === null) return;

        if (url === "") {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
        }

        editor
            .chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href: url })
            .run();
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
                        `<div data-type="embed" data-src="https://player.vimeo.com/video/${vimeoId}"><iframe src="https://player.vimeo.com/video/${vimeoId}" width="640" height="360" frameborder="0" allowfullscreen></iframe></div>`
                    )
                    .run();
            }
        } else {
            // Generic embed
            editor
                .chain()
                .focus()
                .insertContent(
                    `<div data-type="embed" data-src="${url}"><iframe src="${url}" width="640" height="360" frameborder="0" allowfullscreen></iframe></div>`
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

    const iconSize = 16;

    return (
        <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-border bg-secondary/30 rounded-t-2xl">
            {/* Undo / Redo */}
            <ToolbarButton
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
                title="Undo (Ctrl+Z)"
            >
                <Undo size={iconSize} />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
                title="Redo (Ctrl+Shift+Z)"
            >
                <Redo size={iconSize} />
            </ToolbarButton>

            <ToolbarDivider />

            {/* Headings */}
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                isActive={editor.isActive("heading", { level: 1 })}
                title="Heading 1"
            >
                <Heading1 size={iconSize} />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                isActive={editor.isActive("heading", { level: 2 })}
                title="Heading 2"
            >
                <Heading2 size={iconSize} />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                isActive={editor.isActive("heading", { level: 3 })}
                title="Heading 3"
            >
                <Heading3 size={iconSize} />
            </ToolbarButton>

            <ToolbarDivider />

            {/* Text Formatting */}
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                isActive={editor.isActive("bold")}
                title="Bold (Ctrl+B)"
            >
                <Bold size={iconSize} />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                isActive={editor.isActive("italic")}
                title="Italic (Ctrl+I)"
            >
                <Italic size={iconSize} />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                isActive={editor.isActive("underline")}
                title="Underline (Ctrl+U)"
            >
                <Underline size={iconSize} />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleStrike().run()}
                isActive={editor.isActive("strike")}
                title="Strikethrough"
            >
                <Strikethrough size={iconSize} />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleHighlight().run()}
                isActive={editor.isActive("highlight")}
                title="Highlight"
            >
                <Highlighter size={iconSize} />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleCode().run()}
                isActive={editor.isActive("code")}
                title="Inline Code"
            >
                <Code size={iconSize} />
            </ToolbarButton>

            <ToolbarDivider />

            {/* Alignment */}
            <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign("left").run()}
                isActive={editor.isActive({ textAlign: "left" })}
                title="Align Left"
            >
                <AlignLeft size={iconSize} />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign("center").run()}
                isActive={editor.isActive({ textAlign: "center" })}
                title="Align Center"
            >
                <AlignCenter size={iconSize} />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign("right").run()}
                isActive={editor.isActive({ textAlign: "right" })}
                title="Align Right"
            >
                <AlignRight size={iconSize} />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().setTextAlign("justify").run()}
                isActive={editor.isActive({ textAlign: "justify" })}
                title="Justify"
            >
                <AlignJustify size={iconSize} />
            </ToolbarButton>

            <ToolbarDivider />

            {/* Lists */}
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                isActive={editor.isActive("bulletList")}
                title="Bullet List"
            >
                <List size={iconSize} />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                isActive={editor.isActive("orderedList")}
                title="Numbered List"
            >
                <ListOrdered size={iconSize} />
            </ToolbarButton>

            <ToolbarDivider />

            {/* Block elements */}
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                isActive={editor.isActive("blockquote")}
                title="Blockquote"
            >
                <Quote size={iconSize} />
            </ToolbarButton>
            <ToolbarButton
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                isActive={editor.isActive("codeBlock")}
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
                isActive={editor.isActive("link")}
                title="Add Link (Ctrl+K)"
            >
                <Link size={iconSize} />
            </ToolbarButton>
            {editor.isActive("link") && (
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
