#!/usr/bin/env tsx
/**
 * Ingest All Data
 *
 * Runs both daily evaluation and social media scan ingestion.
 * Designed to be run after each daily scan is complete.
 *
 * Usage:
 *   npm run ingest:all
 *   npm run ingest:all -- --date 2026-01-11
 */

import { execSync } from 'child_process';
import { join } from 'path';

async function main() {
  const args = process.argv.slice(2).join(' ');

  console.log('🚀 ScamDunk History DB - Full Ingestion');
  console.log('=======================================\n');

  try {
    // Run daily evaluation ingestion
    console.log('📊 Step 1: Ingesting daily evaluation data...');
    console.log('─'.repeat(50));
    execSync(`tsx ${join(__dirname, 'ingest-daily-evaluation.ts')} ${args}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    console.log('\n');

    // Run social media scan ingestion
    console.log('📱 Step 2: Ingesting social media scan data...');
    console.log('─'.repeat(50));
    execSync(`tsx ${join(__dirname, 'ingest-social-media-scan.ts')} ${args}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    console.log('\n');
    console.log('═'.repeat(50));
    console.log('✅ All ingestion complete!');
    console.log('═'.repeat(50));

  } catch (error) {
    console.error('\n❌ Ingestion failed:', error);
    process.exit(1);
  }
}

main();
