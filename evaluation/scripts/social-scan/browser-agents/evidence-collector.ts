/**
 * Evidence Collector
 *
 * Captures screenshots of high-promotion findings and
 * stores evidence for the audit trail.
 * Screenshots uploaded to Supabase Storage (if configured)
 * or saved locally.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { BrowserSession, PlatformName, BrowserEvidence } from './types';

const EVIDENCE_DIR = path.join(__dirname, '..', '..', '..', 'evaluation', 'results', 'browser-evidence');
const SCREENSHOT_DIR = path.join(EVIDENCE_DIR, 'screenshots');

export class EvidenceCollector {
  private evidence: BrowserEvidence[] = [];
  private screenshotCount = 0;

  constructor() {
    // Ensure directories exist
    if (!fs.existsSync(EVIDENCE_DIR)) {
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    }
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  }

  /**
   * Capture a screenshot of the current page as evidence.
   * Returns the local file path of the screenshot.
   */
  async captureScreenshot(
    session: BrowserSession,
    url: string,
    ticker: string,
    platform: PlatformName
  ): Promise<string | null> {
    try {
      this.screenshotCount++;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${platform}-${ticker}-${timestamp}.png`;
      const filepath = path.join(SCREENSHOT_DIR, filename);

      await session.screenshot(filepath);
      console.log(`      Screenshot saved: ${filename}`);

      return filepath;
    } catch (error: any) {
      console.warn(`      Screenshot failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Add evidence to the collection for this scan run.
   */
  addEvidence(evidence: BrowserEvidence): void {
    this.evidence.push(evidence);
  }

  /**
   * Save all collected evidence to a JSON file for this scan date.
   */
  saveEvidenceFile(scanDate: string): string {
    const outputPath = path.join(EVIDENCE_DIR, `browser-evidence-${scanDate}.json`);

    // Append to existing file if it exists
    let existing: BrowserEvidence[] = [];
    if (fs.existsSync(outputPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
      } catch { /* start fresh */ }
    }

    const combined = [...existing, ...this.evidence];
    fs.writeFileSync(outputPath, JSON.stringify(combined, null, 2));
    console.log(`  Evidence saved: ${outputPath} (${combined.length} items, ${this.screenshotCount} screenshots)`);

    return outputPath;
  }

  /**
   * Get summary of collected evidence.
   */
  getSummary(): { totalEvidence: number; totalScreenshots: number; byPlatform: Record<string, number> } {
    const byPlatform: Record<string, number> = {};
    for (const ev of this.evidence) {
      byPlatform[ev.platform] = (byPlatform[ev.platform] || 0) + 1;
    }
    return {
      totalEvidence: this.evidence.length,
      totalScreenshots: this.screenshotCount,
      byPlatform,
    };
  }

  /**
   * Upload screenshots to Supabase Storage (if configured).
   * Returns the public URL for each uploaded file.
   */
  async uploadToSupabase(localPath: string): Promise<string | null> {
    // TODO: Implement Supabase Storage upload
    // For now, return local path as placeholder
    // This will be implemented in Phase 3 when wiring up evidence storage
    return localPath;
  }
}
