"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import AdminLayout from "@/components/admin/AdminLayout";
import { ArrowLeft, Save, Trash2, Eye, Upload, Sparkles, Loader2, FileText, AlertCircle } from "lucide-react";
import mammoth from "mammoth";

interface BlogPost {
    id?: string;
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    coverImage: string;
    author: string;
    category: string;
    tags: string;
    isPublished: boolean;
    publishedAt: string | null;
}

interface TeamMember {
    id: string;
    name: string;
    email: string;
}

const CATEGORIES = [
    "General",
    "Security Tips",
    "Industry News",
    "Product Updates",
    "Case Studies",
    "Guides",
];

export default function AdminBlogEditorPage() {
    const router = useRouter();
    const params = useParams();
    const isNew = params.id === "new";
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [analyzing, setAnalyzing] = useState(false);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [currentUserName, setCurrentUserName] = useState("Scam Dunk Team");
    const [visualSuggestion, setVisualSuggestion] = useState("");
    const [isDragging, setIsDragging] = useState(false);
    const [post, setPost] = useState<BlogPost>({
        title: "",
        slug: "",
        excerpt: "",
        content: "",
        coverImage: "",
        author: "Scam Dunk Team",
        category: "General",
        tags: "",
        isPublished: false,
        publishedAt: null,
    });

    useEffect(() => {
        fetchTeamMembers();
        if (!isNew) {
            fetchPost();
        }
    }, [isNew]);

    async function fetchTeamMembers() {
        try {
            const res = await fetch("/api/admin/news/team");
            if (res.ok) {
                const data = await res.json();
                setTeamMembers(data.members || []);
                setCurrentUserName(data.currentUserName || "Scam Dunk Team");
                // Set default author to current user for new posts
                if (isNew && data.currentUserName) {
                    setPost(prev => ({ ...prev, author: data.currentUserName }));
                }
            }
        } catch (error) {
            console.error("Failed to fetch team members:", error);
        }
    }

    async function fetchPost() {
        try {
            const res = await fetch(`/api/admin/news/blog/${params.id}`);
            if (res.ok) {
                const data = await res.json();
                setPost(data.post);
            } else {
                router.push("/admin/news/blog");
            }
        } catch (error) {
            console.error("Failed to fetch post:", error);
            router.push("/admin/news/blog");
        } finally {
            setLoading(false);
        }
    }

    function generateSlug(title: string) {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .trim();
    }

    function handleTitleChange(title: string) {
        setPost((prev) => ({
            ...prev,
            title,
            slug: isNew || prev.slug === generateSlug(prev.title) ? generateSlug(title) : prev.slug,
        }));
    }

    async function handleFileImport(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;
        await processFile(file);

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }

    async function processFile(file: File) {
        const fileName = file.name.toLowerCase();
        const fileExt = fileName.split('.').pop() || '';

        // Supported formats
        const textFormats = ['md', 'txt', 'markdown', 'text', 'rtf'];
        const htmlFormats = ['html', 'htm'];
        const docFormats = ['docx'];
        const allFormats = [...textFormats, ...htmlFormats, ...docFormats];

        const isTextFormat = textFormats.includes(fileExt) || file.type.startsWith('text/');
        const isHtmlFormat = htmlFormats.includes(fileExt) || file.type === 'text/html';
        const isDocxFormat = docFormats.includes(fileExt) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

        if (!isTextFormat && !isHtmlFormat && !isDocxFormat) {
            alert(`Unsupported file format (.${fileExt}). Supported formats: ${allFormats.join(', ')}`);
            return;
        }

        setAnalyzing(true); // Show loading state while processing

        try {
            let text = '';

            if (isDocxFormat) {
                // Handle .docx files using mammoth
                const arrayBuffer = await file.arrayBuffer();
                const result = await mammoth.convertToHtml({ arrayBuffer });
                // Convert HTML to simple markdown-like text
                text = convertHtmlToMarkdown(result.value);
                if (result.messages.length > 0) {
                    console.log('Mammoth conversion messages:', result.messages);
                }
            } else if (isHtmlFormat) {
                // Handle HTML files
                const htmlContent = await file.text();
                text = convertHtmlToMarkdown(htmlContent);
            } else {
                // Handle plain text formats
                text = await file.text();
            }

            setPost(prev => ({ ...prev, content: text }));

            // Auto-analyze the imported content
            await analyzeContent(text);
        } catch (error) {
            console.error("Failed to read file:", error);
            alert("Failed to read the file. Please try a different format.");
            setAnalyzing(false);
        }
    }

    function convertHtmlToMarkdown(html: string): string {
        // Simple HTML to markdown conversion
        let text = html;

        // Remove script and style tags
        text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

        // Convert headings
        text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n');
        text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
        text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
        text = text.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n');
        text = text.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n##### $1\n');
        text = text.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n###### $1\n');

        // Convert paragraphs and line breaks
        text = text.replace(/<p[^>]*>/gi, '\n\n');
        text = text.replace(/<\/p>/gi, '');
        text = text.replace(/<br\s*\/?>/gi, '\n');

        // Convert bold and italic
        text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
        text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
        text = text.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
        text = text.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

        // Convert links
        text = text.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');

        // Convert lists
        text = text.replace(/<ul[^>]*>/gi, '\n');
        text = text.replace(/<\/ul>/gi, '\n');
        text = text.replace(/<ol[^>]*>/gi, '\n');
        text = text.replace(/<\/ol>/gi, '\n');
        text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

        // Convert blockquotes
        text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n> $1\n');

        // Remove remaining HTML tags
        text = text.replace(/<[^>]+>/g, '');

        // Decode HTML entities
        text = text.replace(/&nbsp;/g, ' ');
        text = text.replace(/&amp;/g, '&');
        text = text.replace(/&lt;/g, '<');
        text = text.replace(/&gt;/g, '>');
        text = text.replace(/&quot;/g, '"');
        text = text.replace(/&#39;/g, "'");

        // Clean up extra whitespace
        text = text.replace(/\n{3,}/g, '\n\n');
        text = text.trim();

        return text;
    }

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }

    function handleDragLeave(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }

    async function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            await processFile(files[0]);
        }
    }

    async function analyzeContent(contentToAnalyze?: string) {
        const content = contentToAnalyze || post.content;
        if (!content.trim()) {
            alert("Please enter or import content first");
            return;
        }

        setAnalyzing(true);
        try {
            const res = await fetch("/api/admin/news/blog/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            });

            if (res.ok) {
                const data = await res.json();
                setPost(prev => ({
                    ...prev,
                    title: data.title || prev.title,
                    excerpt: data.excerpt || prev.excerpt,
                    category: data.suggestedCategory || prev.category,
                    slug: generateSlug(data.title || prev.title),
                }));
                setVisualSuggestion(data.visualSuggestion || "");
            } else {
                const data = await res.json();
                alert(data.error || "Failed to analyze content");
            }
        } catch (error) {
            console.error("Failed to analyze content:", error);
            alert("Failed to analyze content");
        } finally {
            setAnalyzing(false);
        }
    }

    async function handleSave(publish: boolean = false) {
        if (!post.title.trim()) {
            alert("Please enter a title");
            return;
        }
        if (!post.content.trim()) {
            alert("Please enter content");
            return;
        }

        setSaving(true);
        try {
            const body = {
                ...post,
                isPublished: publish ? true : post.isPublished,
                publishedAt: publish && !post.publishedAt ? new Date().toISOString() : post.publishedAt,
            };

            const url = isNew ? "/api/admin/news/blog" : `/api/admin/news/blog/${params.id}`;
            const method = isNew ? "POST" : "PUT";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                router.push("/admin/news/blog");
            } else {
                const data = await res.json();
                alert(data.error || "Failed to save post");
            }
        } catch (error) {
            console.error("Failed to save post:", error);
            alert("Failed to save post");
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        if (!confirm("Are you sure you want to delete this post? This cannot be undone.")) {
            return;
        }

        try {
            const res = await fetch(`/api/admin/news/blog/${params.id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                router.push("/admin/news/blog");
            }
        } catch (error) {
            console.error("Failed to delete post:", error);
        }
    }

    if (loading) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <Link
                            href="/admin/news/blog"
                            className="mr-4 p-2 text-muted-foreground hover:text-muted-foreground rounded-2xl hover:bg-secondary"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">
                                {isNew ? "New Blog Post" : "Edit Blog Post"}
                            </h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {isNew ? "Create a new blog post" : "Update your blog post"}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {!isNew && (
                            <button
                                onClick={handleDelete}
                                className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-2xl hover:bg-red-100 transition-colors"
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                            </button>
                        )}
                        <button
                            onClick={() => handleSave(false)}
                            disabled={saving}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-foreground bg-secondary rounded-2xl hover:bg-secondary transition-colors disabled:opacity-50"
                        >
                            <Save className="h-4 w-4 mr-2" />
                            Save Draft
                        </button>
                        <button
                            onClick={() => handleSave(true)}
                            disabled={saving}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white gradient-brand rounded-2xl hover:opacity-90 transition-colors disabled:opacity-50"
                        >
                            {post.isPublished ? (
                                <>
                                    <Save className="h-4 w-4 mr-2" />
                                    Update
                                </>
                            ) : (
                                <>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Publish
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Editor Form */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Import Section - Drop Zone */}
                        <div
                            className={`relative rounded-2xl shadow transition-all duration-200 ${isDragging
                                ? 'bg-primary/10 border-2 border-dashed border-primary/50 scale-[1.02]'
                                : 'bg-gradient-to-r from-primary/5 to-purple-50 border-2 border-dashed border-transparent'
                                }`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                        >
                            <div className="p-6">
                                <div className="flex items-start gap-4">
                                    <div className={`flex-shrink-0 p-3 rounded-xl transition-colors ${isDragging ? 'bg-primary/15' : 'bg-card/50'
                                        }`}>
                                        <FileText className={`h-8 w-8 ${isDragging ? 'text-primary' : 'text-primary'
                                            }`} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-base font-semibold text-foreground mb-1">
                                            {isDragging ? '📄 Drop your file here!' : 'Import Blog Post'}
                                        </h3>
                                        <p className="text-sm text-muted-foreground mb-4">
                                            {isDragging
                                                ? 'Release to import the file'
                                                : 'Drag & drop a file here, or click to browse. You can drag files from Google Drive, Dropbox, or any folder. AI will extract the title, description, and suggest a visual.'
                                            }
                                        </p>
                                        {!isDragging && (
                                            <div className="flex flex-wrap items-center gap-3">
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept=".md,.txt,.markdown,.docx,.html,.htm,.rtf,text/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                                    onChange={handleFileImport}
                                                    className="hidden"
                                                    id="file-import"
                                                />
                                                <button
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary bg-card border border-primary/30 rounded-2xl hover:bg-primary/5 transition-colors shadow-sm"
                                                >
                                                    <Upload className="h-4 w-4 mr-2" />
                                                    Browse Files
                                                </button>
                                                <button
                                                    onClick={() => analyzeContent()}
                                                    disabled={analyzing || !post.content.trim()}
                                                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-purple-700 bg-card border border-purple-300 rounded-2xl hover:bg-purple-50 transition-colors disabled:opacity-50 shadow-sm"
                                                >
                                                    {analyzing ? (
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                    ) : (
                                                        <Sparkles className="h-4 w-4 mr-2" />
                                                    )}
                                                    {analyzing ? "Analyzing..." : "AI Extract Metadata"}
                                                </button>
                                                <span className="text-xs text-muted-foreground">
                                                    Supports: .docx, .md, .txt, .html, .rtf
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-card rounded-2xl shadow p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Title *
                                    </label>
                                    <input
                                        type="text"
                                        value={post.title}
                                        onChange={(e) => handleTitleChange(e.target.value)}
                                        className="w-full px-4 py-2 border border-border rounded-2xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary/50"
                                        placeholder="Enter post title"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Slug
                                    </label>
                                    <div className="flex items-center">
                                        <span className="text-muted-foreground mr-2">/news/</span>
                                        <input
                                            type="text"
                                            value={post.slug}
                                            onChange={(e) => setPost({ ...post, slug: e.target.value })}
                                            className="flex-1 px-4 py-2 border border-border rounded-2xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary/50"
                                            placeholder="post-url-slug"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Excerpt
                                    </label>
                                    <textarea
                                        value={post.excerpt}
                                        onChange={(e) => setPost({ ...post, excerpt: e.target.value })}
                                        rows={2}
                                        className="w-full px-4 py-2 border border-border rounded-2xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary/50"
                                        placeholder="Brief summary of the post (shown in previews)"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Content * (Markdown supported)
                                    </label>
                                    <textarea
                                        value={post.content}
                                        onChange={(e) => setPost({ ...post, content: e.target.value })}
                                        rows={15}
                                        className="w-full px-4 py-2 border border-border rounded-2xl focus:ring-2 focus:ring-primary focus:border-primary/50 font-mono text-sm"
                                        placeholder="Write your blog post content here..."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Status */}
                        <div className="bg-card rounded-2xl shadow p-6">
                            <h3 className="text-sm font-medium text-foreground mb-4">Status</h3>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">
                                    {post.isPublished ? "Published" : "Draft"}
                                </span>
                                <button
                                    onClick={() => setPost({ ...post, isPublished: !post.isPublished })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${post.isPublished ? "gradient-brand" : "bg-secondary"
                                        }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${post.isPublished ? "translate-x-6" : "translate-x-1"
                                            }`}
                                    />
                                </button>
                            </div>
                            {post.publishedAt && (
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Published: {new Date(post.publishedAt).toLocaleDateString()}
                                </p>
                            )}
                        </div>

                        {/* Metadata */}
                        <div className="bg-card rounded-2xl shadow p-6">
                            <h3 className="text-sm font-medium text-foreground mb-4">Metadata</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Author
                                    </label>
                                    <select
                                        value={post.author}
                                        onChange={(e) => setPost({ ...post, author: e.target.value })}
                                        className="w-full px-3 py-2 border border-border rounded-2xl focus:ring-2 focus:ring-primary focus:border-primary/50 text-sm"
                                    >
                                        {teamMembers.map((member) => (
                                            <option key={member.id} value={member.name}>
                                                {member.name}
                                                {member.email && ` (${member.email})`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Category
                                    </label>
                                    <select
                                        value={post.category}
                                        onChange={(e) => setPost({ ...post, category: e.target.value })}
                                        className="w-full px-3 py-2 border border-border rounded-2xl focus:ring-2 focus:ring-primary focus:border-primary/50 text-sm"
                                    >
                                        {CATEGORIES.map((cat) => (
                                            <option key={cat} value={cat}>
                                                {cat}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">
                                        Tags
                                    </label>
                                    <input
                                        type="text"
                                        value={post.tags}
                                        onChange={(e) => setPost({ ...post, tags: e.target.value })}
                                        className="w-full px-3 py-2 border border-border rounded-2xl focus:ring-2 focus:ring-primary focus:border-primary/50 text-sm"
                                        placeholder="scam, security, tips (comma-separated)"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Featured Image */}
                        <div className="bg-card rounded-2xl shadow p-6">
                            <h3 className="text-sm font-medium text-foreground mb-4">Cover Image</h3>
                            <div>
                                <input
                                    type="url"
                                    value={post.coverImage}
                                    onChange={(e) => setPost({ ...post, coverImage: e.target.value })}
                                    className="w-full px-3 py-2 border border-border rounded-2xl focus:ring-2 focus:ring-primary focus:border-primary/50 text-sm"
                                    placeholder="https://example.com/image.jpg"
                                />
                                {post.coverImage && (
                                    <img
                                        src={post.coverImage}
                                        alt="Cover preview"
                                        className="mt-3 w-full h-32 object-cover rounded-2xl"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = "none";
                                        }}
                                    />
                                )}
                            </div>
                            {/* AI Visual Suggestion */}
                            {visualSuggestion && (
                                <div className="mt-4 p-3 bg-purple-50 rounded-2xl">
                                    <div className="flex items-start gap-2">
                                        <Sparkles className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-xs font-medium text-purple-800">AI Suggestion</p>
                                            <p className="text-xs text-purple-700 mt-1">{visualSuggestion}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}
