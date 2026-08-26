/** Storage adapter for the canonical daily-price dataset.
 *
 * The reader uses only the existing Supabase URL + anon key. Publishing is
 * intentionally service-role-only and is designed to run on the iMac, never
 * in GitHub Actions.
 */
import { createClient } from "@supabase/supabase-js";
import {
  DailyPriceDatasetArtifacts,
  ValidatedDailyPriceDataset,
  loadValidatedDailyPriceDataset,
  sha256Json,
} from "./daily-price-dataset";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function configuredBucket(): string {
  const bucket = requiredEnvironment("SCAMDUNK_PRICE_DATASET_BUCKET");
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucket)) {
    throw new Error("SCAMDUNK_PRICE_DATASET_BUCKET must be a valid Supabase bucket name");
  }
  return bucket;
}

export async function loadDailyPriceDatasetFromSupabase(input: {
  expectedSymbols: string[];
  maxAgeHours: number;
  now?: Date;
}): Promise<ValidatedDailyPriceDataset> {
  const supabase = createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
  const bucket = configuredBucket();
  return loadValidatedDailyPriceDataset({
    expectedSymbols: input.expectedSymbols,
    maxAgeHours: input.maxAgeHours,
    now: input.now,
    fetchObject: async (objectPath) => {
      const { data, error } = await supabase.storage.from(bucket).download(objectPath);
      if (error || !data) throw new Error(error?.message || `missing object ${objectPath}`);
      return data.text();
    },
  });
}

/**
 * Publish immutable objects, independently re-read them, then replace only
 * current.json. The pointer is the final commit record; consumers reject all
 * data until its checksum matches the immutable manifest.
 */
export async function publishDailyPriceDatasetToSupabase(
  artifacts: DailyPriceDatasetArtifacts,
): Promise<void> {
  const supabase = createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const bucket = configuredBucket();
  const storage = supabase.storage.from(bucket);
  const immutableObjects = [
    [artifacts.scanWindowPath, artifacts.scanWindow],
    [artifacts.manifestPath, artifacts.manifest],
  ] as const;

  for (const [objectPath, body] of immutableObjects) {
    const { error } = await storage.upload(objectPath, JSON.stringify(body), {
      contentType: "application/json",
      upsert: false,
    });
    if (error) {
      throw new Error(`failed to publish immutable ${objectPath}: ${error.message}`);
    }
    const { data, error: downloadError } = await storage.download(objectPath);
    if (downloadError || !data) {
      throw new Error(`failed to verify immutable ${objectPath}: ${downloadError?.message || "missing"}`);
    }
    const published = JSON.parse(await data.text());
    if (sha256Json(published) !== sha256Json(body)) {
      throw new Error(`checksum verification failed for immutable ${objectPath}`);
    }
  }

  const { error: pointerError } = await storage.upload(
    "v1/current.json",
    JSON.stringify(artifacts.currentPointer),
    { contentType: "application/json", upsert: true },
  );
  if (pointerError) throw new Error(`failed to promote current pointer: ${pointerError.message}`);
}
