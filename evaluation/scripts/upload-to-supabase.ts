/**
 * Upload Evaluation Results to Supabase Storage
 *
 * This script uploads evaluation results to Supabase Storage bucket
 * for ingestion via the admin dashboard.
 *
 * Usage:
 *   npx ts-node scripts/upload-to-supabase.ts [date]
 *
 * If no date is provided, uses today's date.
 *
 * Required environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY for write access)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const RESULTS_DIR = path.join(__dirname, '..', 'results');
const BUCKET_NAME = 'evaluation-data';

// File patterns to upload
const FILE_PATTERNS = [
  { prefix: 'fmp-evaluation-', type: 'evaluation' },
  { prefix: 'fmp-summary-', type: 'summary' },
  { prefix: 'fmp-high-risk-', type: 'high-risk' },
  { prefix: 'social-media-scan-', type: 'social-media' },
  { prefix: 'promoted-stocks-', type: 'promoted' },
];

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  return createClient(supabaseUrl, supabaseKey);
}

async function uploadFile(supabase: ReturnType<typeof createClient>, filePath: string, fileName: string) {
  const fileContent = fs.readFileSync(filePath);
  const contentType = fileName.endsWith('.json') ? 'application/json' : 'text/markdown';

  console.log(`  Uploading ${fileName}...`);

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, fileContent, {
      contentType,
      upsert: true, // Overwrite if exists
    });

  if (error) {
    throw new Error(`Failed to upload ${fileName}: ${error.message}`);
  }

  console.log(`  ✓ Uploaded ${fileName}`);
}

async function uploadDateFiles(date: string) {
  const supabase = getSupabaseClient();
  let uploadCount = 0;

  console.log(`\nUploading files for ${date}...`);

  for (const pattern of FILE_PATTERNS) {
    // Try both .json and .md extensions
    const extensions = pattern.type === 'social-media' ? ['.md', '.json'] : ['.json'];

    for (const ext of extensions) {
      const fileName = `${pattern.prefix}${date}${ext}`;
      const filePath = path.join(RESULTS_DIR, fileName);

      if (fs.existsSync(filePath)) {
        await uploadFile(supabase, filePath, fileName);
        uploadCount++;
      }
    }
  }

  return uploadCount;
}

async function listResultsFiles() {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.log('Results directory not found');
    return [];
  }

  const files = fs.readdirSync(RESULTS_DIR);
  const dates = new Set<string>();

  // Extract unique dates from filenames
  for (const file of files) {
    const match = file.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) {
      dates.add(match[1]);
    }
  }

  return Array.from(dates).sort().reverse();
}

async function main() {
  console.log('='.repeat(60));
  console.log('SUPABASE UPLOAD UTILITY');
  console.log('='.repeat(60));

  const args = process.argv.slice(2);
  let datesToUpload: string[] = [];

  if (args[0] === '--all') {
    // Upload all available dates
    datesToUpload = await listResultsFiles();
    console.log(`Found ${datesToUpload.length} dates with evaluation files`);
  } else if (args[0]) {
    // Upload specific date
    datesToUpload = [args[0]];
  } else {
    // Upload today's date
    const today = new Date().toISOString().split('T')[0];
    datesToUpload = [today];
  }

  let totalUploaded = 0;

  for (const date of datesToUpload) {
    try {
      const count = await uploadDateFiles(date);
      totalUploaded += count;
      if (count === 0) {
        console.log(`  No files found for ${date}`);
      }
    } catch (error) {
      console.error(`  Error uploading ${date}:`, error);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Upload complete: ${totalUploaded} files uploaded`);
  console.log('='.repeat(60));
}

// Export for use in other scripts
export { uploadDateFiles, getSupabaseClient, BUCKET_NAME };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
