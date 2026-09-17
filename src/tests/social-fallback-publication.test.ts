import { retainAndPublishSocialFallback, buildFallbackPayload } from '../../evaluation/scripts/social-fallback-publication';
import { parseCliSocialIngestPayload, ingestCliSocialScan } from '@/lib/social-scan/cli-ingest';

import { source, targets } from "./fixtures/social-fallback";
const confirm = (id: string) => ({ scanRunId: id, status: 'PARTIAL', totalMentions: 1,
  mentionsIngested: 1, tickersWithMentions: 1, tickersScanned: 0, idempotent: false });
function options(fetcher = jest.fn()) {
  return { appUrl: 'https://app.example.test', ingestKey: 'private-key',
    fetcher, retain: jest.fn(), sleep: jest.fn().mockResolvedValue(undefined) };
}

test('maps actual local format without claiming coverage or mutating source', () => {
  const before = JSON.stringify(source);
  const payload = buildFallbackPayload(source, targets);
  expect(parseCliSocialIngestPayload(payload).success).toBe(true);
  expect(payload.status).toBe('PARTIAL');
  expect(payload.platformsUsed).toMatchObject({ submittedTickers: targets, coverage: [] });
  expect(payload.results[0].platforms[0].mentions[0]).toMatchObject({ title: '🚀 原文', content: 'raw\u0000content', postDate: null, engagement: { views: 0 } });
  expect(JSON.stringify(source)).toBe(before);
  expect(buildFallbackPayload(JSON.parse(before), targets).scanId).toBe(payload.scanId);
  expect(buildFallbackPayload({ ...source, duration: 124 }, targets).scanId).not.toBe(payload.scanId);
});

test('retains raw source and exact payload before network, accepts only server confirmation', async () => {
  const opts = options();
  opts.fetcher.mockImplementation(async (_url, request) => {
    expect(opts.retain).toHaveBeenCalledTimes(1);
    expect(request.redirect).toBe('error');
    expect(request.headers.Authorization).toBe('Bearer private-key');
    expect(request.signal).toBeInstanceOf(AbortSignal);
    return new Response(JSON.stringify(confirm(JSON.parse(request.body).scanId)));
  });
  const result = await retainAndPublishSocialFallback(source, targets, opts);
  expect(result).toMatchObject({ state: 'PUBLISHED', status: 'PARTIAL', attempts: 1 });
  expect(opts.retain.mock.calls[0][0]).toEqual(source);
  expect(opts.fetcher.mock.calls[0][1].body).toBe(opts.retain.mock.calls[0][1]);
});

test('lost response then transient HTTP retry uses identical bytes and accepts idempotent acknowledgement', async () => {
  const opts = options();
  opts.fetcher.mockRejectedValueOnce(new Error('private-key'))
    .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
    .mockImplementationOnce(async (_url, request) => new Response(JSON.stringify({ ...confirm(JSON.parse(request.body).scanId), idempotent: true, mentionsIngested: 0 })));
  expect(await retainAndPublishSocialFallback(source, targets, opts)).toMatchObject({ state: 'PUBLISHED', attempts: 3, idempotent: true });
  expect(new Set(opts.fetcher.mock.calls.map((call) => call[1].body)).size).toBe(1);
});

test.each([400, 401, 403, 409, 413])('rejects HTTP %s without retry or leaking response', async (status) => {
  const opts = options(jest.fn().mockResolvedValue(new Response('private-key', { status })));
  const result = await retainAndPublishSocialFallback(source, targets, opts);
  expect(result).toMatchObject({ state: 'DEGRADED', attempts: 1 });
  expect(JSON.stringify(result)).not.toContain('private-key');
  expect(opts.fetcher).toHaveBeenCalledTimes(1);
});

test('bounds repeated failure to three requests', async () => {
  const opts = options(jest.fn().mockRejectedValue(new Error('secret')));
  expect(await retainAndPublishSocialFallback(source, targets, opts)).toMatchObject({ state: 'DEGRADED', attempts: 3 });
  expect(opts.fetcher).toHaveBeenCalledTimes(3);
});

test.each([{ scanRunId: 'other' }, { status: 'COMPLETED' }, { totalMentions: -1 }, { tickersScanned: 1 }])('rejects inconsistent successful response %j', async (patch) => {
  const opts = options(jest.fn(async (_url, request) => new Response(JSON.stringify({ ...confirm(JSON.parse(request.body).scanId), ...patch }))));
  expect(await retainAndPublishSocialFallback(source, targets, opts)).toMatchObject({ state: 'DEGRADED' });
});

test('missing key or unsafe URL keeps evidence without network', async () => {
  for (const config of [{ ingestKey: '' }, { appUrl: 'http://app.example.test' }, { appUrl: 'https://user:pass@app.example.test' }]) {
    const opts = { ...options(), ...config };
    expect(await retainAndPublishSocialFallback(source, targets, opts)).toMatchObject({ state: 'DEGRADED', attempts: 0 });
    expect(opts.retain).toHaveBeenCalled();
    expect(opts.fetcher).not.toHaveBeenCalled();
  }
});

test('retention failure prevents any network request', async () => {
  const opts = options(); opts.retain.mockImplementation(() => { throw new Error('disk failure'); });
  await expect(retainAndPublishSocialFallback(source, targets, opts)).rejects.toThrow('disk failure');
  expect(opts.fetcher).not.toHaveBeenCalled();
});

test('actual server adapter persists fallback as PARTIAL with zero verified searched tickers', async () => {
  const parsed = parseCliSocialIngestPayload(buildFallbackPayload(source, targets));
  if (!parsed.success) throw parsed.error;
  const tx = { $executeRawUnsafe: jest.fn(), $queryRawUnsafe: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ totalMentions: 1, tickers: ['ABCD'], platforms: ['YouTube'] }]),
    socialScanRun: { create: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    socialMention: { createMany: jest.fn().mockResolvedValue({ count: 1 }) } };
  const result = await ingestCliSocialScan({ $transaction: async (fn: any) => fn(tx) } as never, parsed.data, { owner: 'cli:api-key' });
  expect(result).toMatchObject({ status: 'PARTIAL', tickersScanned: 0, totalMentions: 1 });
});

test('pipeline publishes only the local branch and retains source, request and receipt in workflow artifacts', () => {
  const fs = require('fs');
  const pipeline = fs.readFileSync('evaluation/scripts/enhanced-daily-pipeline.ts', 'utf8');
  const workflow = fs.readFileSync('.github/workflows/enhanced-daily-evaluation.yml', 'utf8');
  expect(pipeline).toContain('await retainAndPublishSocialFallback(');
  expect(pipeline).toContain('ingestKey: SOCIAL_SCAN_INGEST_KEY');
  expect(pipeline).toContain('publication: fallbackPublication');
  for (const name of ['social-scan-', 'social-ingest-request-', 'social-ingest-publication-']) {
    expect(pipeline).toContain(name);
    expect(workflow).toContain(`cp evaluation/results/${name}`);
  }
  expect(workflow.match(/SOCIAL_SCAN_INGEST_KEY: \$\{\{ secrets.SOCIAL_SCAN_INGEST_KEY \}\}/g)).toHaveLength(2);
  expect(pipeline).not.toContain('results saved to JSON only');
});

test('request cancellation has a bounded deadline and retries no more than three times', async () => {
  jest.useFakeTimers();
  const timeout = jest.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  });
  try {
    const opts = options(jest.fn((_url, request) => new Promise((_resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(new Error('aborted')));
    })));
    const pending = retainAndPublishSocialFallback(source, targets, opts);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(await pending).toMatchObject({ state: 'DEGRADED', attempts: 3 });
    expect(timeout.mock.calls).toEqual([[20_000], [20_000], [20_000]]);
  } finally { timeout.mockRestore(); jest.useRealTimers(); }
});

test('oversize evidence remains intact locally and is never sent', async () => {
  const large = JSON.parse(JSON.stringify(source));
  large.results[0].platforms[0].mentions[0].content = 'x'.repeat(5 * 1024 * 1024);
  const opts = options();
  expect(await retainAndPublishSocialFallback(large, targets, opts)).toMatchObject({ state: 'DEGRADED', attempts: 0 });
  expect(opts.retain.mock.calls[0][0]).toBe(large);
  expect(opts.fetcher).not.toHaveBeenCalled();
});

test('no-scanner early return still retains FAILED source and confirms zero evidence honestly', async () => {
  const failed = { ...source, status: 'FAILED' as const, results: [], totalMentions: 0, platformsUsed: [], errors: ['No scanners configured'] };
  const opts = options(jest.fn(async (_url, request) => new Response(JSON.stringify({ ...confirm(JSON.parse(request.body).scanId), status: 'FAILED', totalMentions: 0, mentionsIngested: 0, tickersWithMentions: 0 }))));
  expect(await retainAndPublishSocialFallback(failed, targets, opts)).toMatchObject({ state: 'PUBLISHED', status: 'FAILED', totalMentions: 0 });
  expect(opts.retain.mock.calls[0][0]).toEqual(failed);
});


test('normalizes precise provider timestamps but keeps uncertain optional fields unknown', () => {
  const raw = JSON.parse(JSON.stringify(source));
  const mention = raw.results[0].platforms[0].mentions[0];
  mention.postDate = '2094-01-11T04:05:06+03:00';
  mention.sentiment = 'positive';
  mention.engagement = { views: 'many', likes: 0, comments: 3, upvotes: null };
  const payload = buildFallbackPayload(raw, targets);
  expect(parseCliSocialIngestPayload(payload).success).toBe(true);
  expect(payload.results[0].platforms[0].mentions[0]).toMatchObject({ postDate: '2094-01-11T01:05:06.000Z', sentiment: null, engagement: { likes: 0, comments: 3 } });
  expect(payload.platformsUsed.normalization).toMatchObject({ unknownSentiments: 1, omittedEngagementValues: 2 });
  expect(mention.postDate).toBe('2094-01-11T04:05:06+03:00');
});
