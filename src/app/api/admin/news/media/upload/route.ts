import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/auth";
import { getSupabaseClient } from "@/lib/supabase";

const NEWS_MEDIA_BUCKET = "news-media";

const ALLOWED_TYPES: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
    const session = await getAdminSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "File too large. Maximum size is 10MB." },
                { status: 400 }
            );
        }

        const ext = ALLOWED_TYPES[file.type];
        if (!ext) {
            return NextResponse.json(
                { error: `Unsupported file type: ${file.type}` },
                { status: 400 }
            );
        }

        // Generate unique filename: timestamp-randomid.ext
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 10);
        const safeName = file.name
            .replace(/\.[^.]+$/, "")
            .replace(/[^a-zA-Z0-9-_]/g, "-")
            .substring(0, 50);
        const filename = `${timestamp}-${safeName}-${randomId}.${ext}`;

        const supabase = getSupabaseClient();
        const buffer = Buffer.from(await file.arrayBuffer());

        const { data, error } = await supabase.storage
            .from(NEWS_MEDIA_BUCKET)
            .upload(filename, buffer, {
                contentType: file.type,
                upsert: false,
            });

        if (error) {
            console.error("Supabase upload error:", error);
            return NextResponse.json(
                { error: `Upload failed: ${error.message}` },
                { status: 500 }
            );
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from(NEWS_MEDIA_BUCKET)
            .getPublicUrl(filename);

        return NextResponse.json({
            url: urlData.publicUrl,
            filename,
            size: file.size,
            type: file.type,
        });
    } catch (error) {
        console.error("Error uploading media:", error);
        return NextResponse.json(
            { error: "Failed to upload file" },
            { status: 500 }
        );
    }
}
