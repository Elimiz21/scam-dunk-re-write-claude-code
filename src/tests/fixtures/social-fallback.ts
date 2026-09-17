import type { ScanRunResult } from "../../../evaluation/scripts/social-scan/types";
export const source: ScanRunResult = {
  scanId: 'pipeline-2094-01-11-123', scanDate: '2094-01-11', status: 'COMPLETED',
  tickersScanned: 2, tickersWithMentions: 1, totalMentions: 1,
  platformsUsed: ['youtube_api'], errors: [], duration: 123,
  results: [{ ticker: 'ABCD', name: 'Fixture', scanDate: '2094-01-11', totalMentions: 1,
    overallPromotionScore: 20, riskLevel: 'low', hasRealEvidence: true, topPromoters: [], summary: 'source summary',
    platforms: [{ platform: 'YouTube', scanner: 'youtube_api', success: true, mentionsFound: 1,
      activityLevel: 'low', promotionRisk: 'low', scanDuration: 10, mentions: [{
        platform: 'YouTube', source: 'Channel', discoveredVia: 'youtube_api', title: '🚀 原文', content: 'raw\u0000content',
        url: 'https://example.test/post', author: 'Writer', postDate: '', engagement: { views: 0 },
        sentiment: 'neutral', isPromotional: false, promotionScore: 20, redFlags: [],
      }] }],
  }],
};
export const targets = ['ABCD', 'ZERO'];
