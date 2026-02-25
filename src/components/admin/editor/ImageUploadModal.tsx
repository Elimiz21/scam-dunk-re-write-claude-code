"use client";

import { useState, useRef, useCallback } from "react";
import { X, Upload, Link as LinkIcon, Loader2, Image as ImageIcon } from "lucide-react";

interface ImageUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onInsert: (url: string, alt?: string) => void;
    /** If true, uploading for a cover image (single file, no alt text needed) */
    coverMode?: boolean;
}

export default function ImageUploadModal({
    isOpen,
    onClose,
    onInsert,
    coverMode = false,
}: ImageUploadModalProps) {
    const [tab, setTab] = useState<"upload" | "url">("upload");
    const [url, setUrl] = useState("");
    const [alt, setAlt] = useState("");
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [error, setError] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const reset = () => {
        setUrl("");
        setAlt("");
        setPreview(null);
        setError("");
        setUploading(false);
        setDragActive(false);
        setTab("upload");
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    const uploadFile = async (file: File) => {
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            setError("File too large. Maximum size is 10MB.");
            return;
        }

        const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "video/mp4"];
        if (!allowedTypes.includes(file.type)) {
            setError("Unsupported file type. Use JPEG, PNG, GIF, WebP, SVG, or MP4.");
            return;
        }

        setUploading(true);
        setError("");

        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch("/api/admin/news/media/upload", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Upload failed");
            }

            const data = await res.json();
            setPreview(data.url);
            setUrl(data.url);

            if (!alt) {
                setAlt(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) uploadFile(file);
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files[0];
        if (file) uploadFile(file);
    }, []);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
    };

    const handleInsert = () => {
        if (!url.trim()) {
            setError("Please provide an image URL");
            return;
        }
        onInsert(url.trim(), alt.trim() || undefined);
        handleClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden animate-fade-in-scale">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h3 className="text-lg font-semibold text-foreground">
                        {coverMode ? "Upload Cover Image" : "Insert Image"}
                    </h3>
                    <button
                        onClick={handleClose}
                        className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                    <button
                        onClick={() => setTab("upload")}
                        className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                            tab === "upload"
                                ? "text-primary border-b-2 border-primary"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <Upload size={14} className="inline mr-1.5 -mt-0.5" />
                        Upload
                    </button>
                    <button
                        onClick={() => setTab("url")}
                        className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                            tab === "url"
                                ? "text-primary border-b-2 border-primary"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <LinkIcon size={14} className="inline mr-1.5 -mt-0.5" />
                        URL
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 space-y-4">
                    {tab === "upload" && (
                        <div
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onClick={() => fileInputRef.current?.click()}
                            className={`cursor-pointer border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                                dragActive
                                    ? "border-primary bg-primary/5 scale-[1.01]"
                                    : "border-border hover:border-primary/40 hover:bg-secondary/50"
                            }`}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,video/mp4"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            {uploading ? (
                                <div className="flex flex-col items-center gap-2">
                                    <Loader2 size={32} className="text-primary animate-spin" />
                                    <p className="text-sm text-muted-foreground">Uploading...</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-2">
                                    <ImageIcon size={32} className="text-muted-foreground" />
                                    <p className="text-sm font-medium text-foreground">
                                        Drop an image here or click to browse
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        JPEG, PNG, GIF, WebP, SVG up to 10MB
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {tab === "url" && (
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                Image URL
                            </label>
                            <input
                                type="url"
                                value={url}
                                onChange={(e) => {
                                    setUrl(e.target.value);
                                    setPreview(e.target.value);
                                }}
                                placeholder="https://example.com/image.jpg"
                                className="w-full px-3 py-2 border border-border rounded-xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary/50 text-sm"
                            />
                        </div>
                    )}

                    {/* Preview */}
                    {preview && (
                        <div className="rounded-xl overflow-hidden border border-border">
                            <img
                                src={preview}
                                alt="Preview"
                                className="w-full h-40 object-cover"
                                onError={() => setPreview(null)}
                            />
                        </div>
                    )}

                    {/* Alt text */}
                    {!coverMode && (
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                Alt Text
                            </label>
                            <input
                                type="text"
                                value={alt}
                                onChange={(e) => setAlt(e.target.value)}
                                placeholder="Describe the image for accessibility"
                                className="w-full px-3 py-2 border border-border rounded-xl bg-card text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:border-primary/50 text-sm"
                            />
                        </div>
                    )}

                    {error && (
                        <p className="text-sm text-red-500">{error}</p>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-sm font-medium text-foreground bg-secondary rounded-xl hover:bg-secondary/80 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleInsert}
                        disabled={!url.trim() || uploading}
                        className="px-4 py-2 text-sm font-medium text-white gradient-brand rounded-xl hover:opacity-90 transition-colors disabled:opacity-50"
                    >
                        {coverMode ? "Set Cover Image" : "Insert Image"}
                    </button>
                </div>
            </div>
        </div>
    );
}
