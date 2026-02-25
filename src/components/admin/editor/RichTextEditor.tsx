"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import { Link } from "@tiptap/extension-link";
import { Image } from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Youtube } from "@tiptap/extension-youtube";
import { Highlight } from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { useEffect, useState, useCallback, useRef } from "react";
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Strikethrough,
    Link as LinkIcon,
    Heading1,
    Heading2,
    Heading3,
    List,
    ListOrdered,
    Quote,
    Code,
    Image as ImageIcon,
    Table as TableIcon,
    Youtube as YoutubeIcon,
    Minus,
    Type,
    Trash2,
    Columns,
    Rows,
} from "lucide-react";
import EditorToolbar from "./EditorToolbar";
import ImageUploadModal from "./ImageUploadModal";

interface RichTextEditorProps {
    content: string;
    onChange: (html: string) => void;
    placeholder?: string;
}

export default function RichTextEditor({
    content,
    onChange,
    placeholder = "Write your blog post content here... Type / for commands",
}: RichTextEditorProps) {
    const [imageModalOpen, setImageModalOpen] = useState(false);
    const [showSlashMenu, setShowSlashMenu] = useState(false);
    const [slashMenuPos, setSlashMenuPos] = useState({ top: 0, left: 0 });
    const [slashFilter, setSlashFilter] = useState("");
    const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
    const [bubbleMenu, setBubbleMenu] = useState<{ top: number; left: number } | null>(null);
    const editorWrapperRef = useRef<HTMLDivElement>(null);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
            }),
            Underline,
            TextAlign.configure({
                types: ["heading", "paragraph"],
            }),
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    class: "text-primary underline cursor-pointer hover:text-primary/80",
                },
            }),
            Image.configure({
                inline: false,
                allowBase64: true,
                HTMLAttributes: {
                    class: "rounded-xl max-w-full mx-auto",
                },
            }),
            Table.configure({
                resizable: true,
                HTMLAttributes: {
                    class: "border-collapse table-auto w-full",
                },
            }),
            TableRow,
            TableCell.configure({
                HTMLAttributes: {
                    class: "border border-border px-3 py-2 text-sm",
                },
            }),
            TableHeader.configure({
                HTMLAttributes: {
                    class: "border border-border px-3 py-2 text-sm font-semibold bg-secondary/50",
                },
            }),
            Placeholder.configure({ placeholder }),
            Youtube.configure({
                HTMLAttributes: {
                    class: "rounded-xl overflow-hidden mx-auto",
                },
                width: 640,
                height: 360,
            }),
            Highlight.configure({ multicolor: true }),
            TextStyle,
            Color,
        ],
        content: content || "",
        onUpdate: ({ editor: ed }) => {
            onChange(ed.getHTML());
        },
        onSelectionUpdate: ({ editor: ed }) => {
            // Show bubble menu on text selection
            const { from, to } = ed.state.selection;
            if (from !== to && editorWrapperRef.current) {
                const view = ed.view;
                const start = view.coordsAtPos(from);
                const end = view.coordsAtPos(to);
                const wrapperRect = editorWrapperRef.current.getBoundingClientRect();
                setBubbleMenu({
                    top: start.top - wrapperRect.top - 44,
                    left: (start.left + end.left) / 2 - wrapperRect.left - 160,
                });
            } else {
                setBubbleMenu(null);
            }
        },
        editorProps: {
            attributes: {
                class: "prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[400px] px-5 py-4",
            },
            handleKeyDown: (view, event) => {
                // Slash command trigger
                if (event.key === "/" && !showSlashMenu) {
                    const { from } = view.state.selection;
                    const coords = view.coordsAtPos(from);
                    const editorRect = view.dom.getBoundingClientRect();
                    setSlashMenuPos({
                        top: coords.bottom - editorRect.top + 4,
                        left: coords.left - editorRect.left,
                    });
                    setSlashFilter("");
                    setSlashSelectedIndex(0);
                    setTimeout(() => setShowSlashMenu(true), 10);
                    return false;
                }

                if (showSlashMenu) {
                    if (event.key === "Escape") {
                        setShowSlashMenu(false);
                        return true;
                    }
                    if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setSlashSelectedIndex((prev) =>
                            prev < filteredSlashItems.length - 1 ? prev + 1 : 0
                        );
                        return true;
                    }
                    if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setSlashSelectedIndex((prev) =>
                            prev > 0 ? prev - 1 : filteredSlashItems.length - 1
                        );
                        return true;
                    }
                    if (event.key === "Enter") {
                        event.preventDefault();
                        const item = filteredSlashItems[slashSelectedIndex];
                        if (item) executeSlashCommand(item.id);
                        return true;
                    }
                    if (event.key === "Backspace") {
                        if (slashFilter === "") {
                            setShowSlashMenu(false);
                        } else {
                            setSlashFilter((prev) => prev.slice(0, -1));
                        }
                        return false;
                    }
                    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
                        setSlashFilter((prev) => prev + event.key);
                        setSlashSelectedIndex(0);
                        return false;
                    }
                }

                return false;
            },
        },
    });

    // Close slash menu on outside click
    useEffect(() => {
        if (!editor) return;
        const handleClick = () => setShowSlashMenu(false);
        document.addEventListener("click", handleClick);
        return () => document.removeEventListener("click", handleClick);
    }, [editor]);

    // Sync external content changes
    useEffect(() => {
        if (editor && content !== editor.getHTML()) {
            editor.commands.setContent(content || "");
        }
    }, [content]);

    const slashItems = [
        { id: "h1", label: "Heading 1", description: "Large heading", icon: Heading1 },
        { id: "h2", label: "Heading 2", description: "Medium heading", icon: Heading2 },
        { id: "h3", label: "Heading 3", description: "Small heading", icon: Heading3 },
        { id: "text", label: "Text", description: "Plain paragraph", icon: Type },
        { id: "bullet", label: "Bullet List", description: "Unordered list", icon: List },
        { id: "ordered", label: "Numbered List", description: "Ordered list", icon: ListOrdered },
        { id: "quote", label: "Blockquote", description: "Quote block", icon: Quote },
        { id: "code", label: "Code Block", description: "Code snippet", icon: Code },
        { id: "divider", label: "Divider", description: "Horizontal rule", icon: Minus },
        { id: "image", label: "Image", description: "Upload or embed image", icon: ImageIcon },
        { id: "video", label: "Video Embed", description: "YouTube or Vimeo", icon: YoutubeIcon },
        { id: "table", label: "Table", description: "Insert a table", icon: TableIcon },
    ];

    const filteredSlashItems = slashItems.filter(
        (item) =>
            item.label.toLowerCase().includes(slashFilter.toLowerCase()) ||
            item.description.toLowerCase().includes(slashFilter.toLowerCase())
    );

    const executeSlashCommand = useCallback(
        (id: string) => {
            if (!editor) return;

            // Delete the "/" and any typed filter text from the editor
            const { from } = editor.state.selection;
            const textBefore = editor.state.doc.textBetween(
                Math.max(0, from - slashFilter.length - 1),
                from
            );
            if (textBefore.startsWith("/")) {
                editor
                    .chain()
                    .focus()
                    .deleteRange({
                        from: from - slashFilter.length - 1,
                        to: from,
                    })
                    .run();
            }

            switch (id) {
                case "h1":
                    editor.chain().focus().toggleHeading({ level: 1 }).run();
                    break;
                case "h2":
                    editor.chain().focus().toggleHeading({ level: 2 }).run();
                    break;
                case "h3":
                    editor.chain().focus().toggleHeading({ level: 3 }).run();
                    break;
                case "text":
                    editor.chain().focus().setParagraph().run();
                    break;
                case "bullet":
                    editor.chain().focus().toggleBulletList().run();
                    break;
                case "ordered":
                    editor.chain().focus().toggleOrderedList().run();
                    break;
                case "quote":
                    editor.chain().focus().toggleBlockquote().run();
                    break;
                case "code":
                    editor.chain().focus().toggleCodeBlock().run();
                    break;
                case "divider":
                    editor.chain().focus().setHorizontalRule().run();
                    break;
                case "image":
                    setImageModalOpen(true);
                    break;
                case "video": {
                    const url = window.prompt("Enter YouTube or Vimeo URL:");
                    if (url && (url.includes("youtube.com") || url.includes("youtu.be"))) {
                        editor.commands.setYoutubeVideo({ src: url, width: 640, height: 360 });
                    }
                    break;
                }
                case "table":
                    editor
                        .chain()
                        .focus()
                        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                        .run();
                    break;
            }
            setShowSlashMenu(false);
            setSlashFilter("");
        },
        [editor, slashFilter]
    );

    const handleImageInsert = (url: string, alt?: string) => {
        if (!editor) return;
        editor.chain().focus().setImage({ src: url, alt: alt || "" }).run();
    };

    if (!editor) return null;

    const textLength = editor.getText().length;
    const wordCount = editor.getText().split(/\s+/).filter(Boolean).length;

    return (
        <div ref={editorWrapperRef} className="relative border border-border rounded-2xl bg-card overflow-hidden">
            {/* Main Toolbar */}
            <EditorToolbar editor={editor} onImageUpload={() => setImageModalOpen(true)} />

            {/* Bubble Menu — custom positioned on text selection */}
            {bubbleMenu && (
                <div
                    className="absolute z-40 flex items-center gap-0.5 p-1 bg-card border border-border rounded-xl shadow-lg animate-fade-in-scale"
                    style={{ top: bubbleMenu.top, left: Math.max(8, bubbleMenu.left) }}
                    onMouseDown={(e) => e.preventDefault()}
                >
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run(); }}
                        className={`p-1.5 rounded-lg transition-colors ${
                            editor.isActive("heading", { level: 1 }) ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"
                        }`}
                    >
                        <Heading1 size={14} />
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run(); }}
                        className={`p-1.5 rounded-lg transition-colors ${
                            editor.isActive("heading", { level: 2 }) ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"
                        }`}
                    >
                        <Heading2 size={14} />
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 3 }).run(); }}
                        className={`p-1.5 rounded-lg transition-colors ${
                            editor.isActive("heading", { level: 3 }) ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"
                        }`}
                    >
                        <Heading3 size={14} />
                    </button>
                    <div className="w-px h-5 bg-border mx-0.5" />
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
                        className={`p-1.5 rounded-lg transition-colors ${
                            editor.isActive("bold") ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"
                        }`}
                    >
                        <Bold size={14} />
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
                        className={`p-1.5 rounded-lg transition-colors ${
                            editor.isActive("italic") ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"
                        }`}
                    >
                        <Italic size={14} />
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }}
                        className={`p-1.5 rounded-lg transition-colors ${
                            editor.isActive("underline") ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"
                        }`}
                    >
                        <UnderlineIcon size={14} />
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleStrike().run(); }}
                        className={`p-1.5 rounded-lg transition-colors ${
                            editor.isActive("strike") ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"
                        }`}
                    >
                        <Strikethrough size={14} />
                    </button>
                    <div className="w-px h-5 bg-border mx-0.5" />
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            const url = window.prompt("Enter URL:", editor.getAttributes("link").href || "https://");
                            if (url === null) return;
                            if (url === "") {
                                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                            } else {
                                editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
                            }
                        }}
                        className={`p-1.5 rounded-lg transition-colors ${
                            editor.isActive("link") ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"
                        }`}
                    >
                        <LinkIcon size={14} />
                    </button>
                </div>
            )}

            {/* Table floating controls */}
            {editor.isActive("table") && (
                <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-secondary/20 text-xs">
                    <span className="text-muted-foreground font-medium mr-2">Table:</span>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().addColumnBefore().run()}
                        className="px-2 py-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <Columns size={12} className="inline mr-1" />+ Col Before
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().addColumnAfter().run()}
                        className="px-2 py-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                        + Col After
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().deleteColumn().run()}
                        className="px-2 py-1 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                    >
                        - Col
                    </button>
                    <div className="w-px h-4 bg-border mx-1" />
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().addRowBefore().run()}
                        className="px-2 py-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <Rows size={12} className="inline mr-1" />+ Row Before
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().addRowAfter().run()}
                        className="px-2 py-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                        + Row After
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().deleteRow().run()}
                        className="px-2 py-1 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                    >
                        - Row
                    </button>
                    <div className="w-px h-4 bg-border mx-1" />
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().mergeCells().run()}
                        className="px-2 py-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Merge
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().splitCell().run()}
                        className="px-2 py-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Split
                    </button>
                    <button
                        type="button"
                        onClick={() => editor.chain().focus().deleteTable().run()}
                        className="px-2 py-1 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors ml-auto"
                    >
                        <Trash2 size={12} className="inline mr-1" />
                        Delete Table
                    </button>
                </div>
            )}

            {/* Editor Content */}
            <div className="relative">
                <EditorContent editor={editor} />

                {/* Slash Command Menu */}
                {showSlashMenu && filteredSlashItems.length > 0 && (
                    <div
                        className="absolute z-50 w-64 bg-card border border-border rounded-xl shadow-lg overflow-hidden animate-fade-in-scale"
                        style={{ top: slashMenuPos.top, left: slashMenuPos.left }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-1.5 max-h-72 overflow-y-auto">
                            {filteredSlashItems.map((item, index) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => executeSlashCommand(item.id)}
                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                                            index === slashSelectedIndex
                                                ? "bg-primary/10 text-primary"
                                                : "text-foreground hover:bg-secondary"
                                        }`}
                                    >
                                        <div
                                            className={`p-1.5 rounded-lg ${
                                                index === slashSelectedIndex ? "bg-primary/15" : "bg-secondary"
                                            }`}
                                        >
                                            <Icon size={14} />
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium">{item.label}</div>
                                            <div className="text-xs text-muted-foreground">{item.description}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Word count */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-secondary/20 text-xs text-muted-foreground">
                <span>
                    {textLength} characters / {wordCount} words
                </span>
                <span className="text-xs">
                    Type <kbd className="px-1 py-0.5 bg-secondary rounded text-[10px] font-mono">/</kbd> for commands
                </span>
            </div>

            {/* Image Upload Modal */}
            <ImageUploadModal
                isOpen={imageModalOpen}
                onClose={() => setImageModalOpen(false)}
                onInsert={handleImageInsert}
            />
        </div>
    );
}
