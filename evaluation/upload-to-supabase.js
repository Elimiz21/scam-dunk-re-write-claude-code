#!/usr/bin/env node
/**
 * Upload analysis results to Supabase storage bucket
 *
 * Required environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL - Your Supabase project URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY - Your Supabase anon/public key
 *   SUPABASE_BUCKET_NAME - Optional bucket name (defaults to 'analysis-results')
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BUCKET_NAME = process.env.SUPABASE_BUCKET_NAME || 'analysis-results';

// Files to upload (dated analysis files from Jan 2026)
const FILES_TO_UPLOAD = [
  // FMP evaluation results
  'fmp-evaluation-2026-01-15.json',
  'fmp-evaluation-2026-01-16.json',
  'fmp-high-risk-2026-01-15.json',
  'fmp-high-risk-2026-01-16.json',
  'fmp-summary-2026-01-15.json',
  'fmp-summary-2026-01-16.json',

  // Comparison and analysis
  'comparison-report-2026-01-15-16.json',
  'final-analysis-report-2026-01-15-16.txt',

  // OpenAI-filtered results
  'openai-classification-all-high-risk-2026-01-24.json',
  'filtered-high-risk-after-openai-2026-01-24.json',
  'filtered-suspicious-stocks-2026-01-24.json',

  // Social media analysis
  'social-media-pump-analysis-2026-01-24.json',
  'social-media-promotion-evidence-2026-01-25.json'
];

async function uploadFiles() {
  // Validate credentials
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: Supabase credentials not configured.');
    console.error('\nPlease add the following to your .env file:');
    console.error('  NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"');
    console.error('  NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"');
    console.error('  SUPABASE_BUCKET_NAME="analysis-results" (optional)');
    console.error('\nYou can find these values in your Supabase project settings:');
    console.error('  1. Go to https://app.supabase.com');
    console.error('  2. Select your project');
    console.error('  3. Go to Settings > API');
    console.error('  4. Copy the URL and anon key');
    process.exit(1);
  }

  console.log('Connecting to Supabase...');
  console.log(`  URL: ${SUPABASE_URL}`);
  console.log(`  Bucket: ${BUCKET_NAME}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Check if bucket exists, create if not
  console.log('\nChecking bucket...');
  const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();

  if (bucketError) {
    console.error('Error listing buckets:', bucketError.message);
    process.exit(1);
  }

  const bucketExists = buckets.some(b => b.name === BUCKET_NAME);
  if (!bucketExists) {
    console.log(`Creating bucket '${BUCKET_NAME}'...`);
    const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true // Make files publicly accessible
    });
    if (createError) {
      console.error('Error creating bucket:', createError.message);
      console.error('You may need to create the bucket manually in Supabase dashboard.');
      process.exit(1);
    }
  }

  const resultsDir = path.join(__dirname, 'results');
  const uploadResults = [];

  console.log(`\nUploading ${FILES_TO_UPLOAD.length} files to bucket '${BUCKET_NAME}'...\n`);

  for (const filename of FILES_TO_UPLOAD) {
    const filePath = path.join(resultsDir, filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`  SKIP: ${filename} (not found)`);
      continue;
    }

    try {
      const fileContent = fs.readFileSync(filePath);
      const contentType = filename.endsWith('.json') ? 'application/json' : 'text/plain';

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(`jan-2026/${filename}`, fileContent, {
          contentType,
          upsert: true // Overwrite if exists
        });

      if (error) {
        console.log(`  FAIL: ${filename} - ${error.message}`);
        uploadResults.push({ file: filename, success: false, error: error.message });
      } else {
        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${data.path}`;
        console.log(`  OK: ${filename}`);
        console.log(`      URL: ${publicUrl}`);
        uploadResults.push({ file: filename, success: true, url: publicUrl });
      }
    } catch (err) {
      console.log(`  FAIL: ${filename} - ${err.message}`);
      uploadResults.push({ file: filename, success: false, error: err.message });
    }
  }

  // Summary
  const successful = uploadResults.filter(r => r.success);
  const failed = uploadResults.filter(r => !r.success);

  console.log('\n=== Upload Summary ===');
  console.log(`Total: ${uploadResults.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (successful.length > 0) {
    console.log('\nPublic URLs:');
    for (const result of successful) {
      console.log(`  ${result.file}: ${result.url}`);
    }
  }

  // Save upload manifest
  const manifest = {
    uploadedAt: new Date().toISOString(),
    bucket: BUCKET_NAME,
    files: uploadResults
  };

  const manifestPath = path.join(resultsDir, 'upload-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest saved to: ${manifestPath}`);
}

uploadFiles().catch(err => {
  console.error('Upload failed:', err.message);
  process.exit(1);
});
