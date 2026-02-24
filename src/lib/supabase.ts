import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Storage bucket name for evaluation data
export const EVALUATION_BUCKET = "evaluation-data";

// Storage bucket for news/blog media uploads
export const NEWS_MEDIA_BUCKET = "news-media";

// Lazy-initialized Supabase client
let _supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_supabase) return _supabase;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables not configured");
  }

  _supabase = createClient(supabaseUrl, supabaseAnonKey);
  return _supabase;
}

// For backward compatibility
export const supabase = {
  get storage() {
    return getSupabaseClient().storage;
  },
};

/**
 * Get public URL for a file in the evaluation bucket
 */
export function getEvaluationFileUrl(filename: string): string {
  const { data } = supabase.storage
    .from(EVALUATION_BUCKET)
    .getPublicUrl(filename);
  return data.publicUrl;
}

/**
 * List all evaluation files in the bucket
 */
export async function listEvaluationFiles() {
  const { data, error } = await supabase.storage
    .from(EVALUATION_BUCKET)
    .list();

  if (error) {
    console.error("Error listing evaluation files:", error);
    return [];
  }

  return data || [];
}

/**
 * Upload evaluation file to Supabase Storage
 */
export async function uploadEvaluationFile(
  filename: string,
  content: string | Buffer
) {
  const { data, error } = await supabase.storage
    .from(EVALUATION_BUCKET)
    .upload(filename, content, {
      contentType: "application/json",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload ${filename}: ${error.message}`);
  }

  return data;
}
