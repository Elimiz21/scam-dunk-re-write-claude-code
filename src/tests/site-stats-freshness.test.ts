import { GET } from '@/app/api/stats/site/route';
import { prisma } from '@/lib/db';
import { SCORING_VERSION } from '@/lib/scoring/policy';
import { coverageCountMetadata } from '@/lib/publication-counts';

jest.mock('@/lib/db',()=>({prisma:{dailyScanSummary:{findFirst:jest.fn(),findUnique:jest.fn(),aggregate:jest.fn()},stockDailySnapshot:{groupBy:jest.fn()},$queryRaw:jest.fn()}}));
const current=()=>({scanDate:new Date('2026-10-23'),createdAt:new Date('2026-10-24T07:00:00Z'),artifactRevisionId:'verified-revision',artifactRevision:{status:'PUBLISHED'},byExchange:JSON.stringify({_coverage:coverageCountMetadata(2)}),totalStocks:17,evaluated:10,skippedNoData:5,lowRiskCount:5,mediumRiskCount:3,highRiskCount:2,insufficientCount:0});
describe('published site statistics',()=>{
 beforeEach(()=>{
  jest.useFakeTimers().setSystemTime(new Date('2026-10-26T06:25:00Z'));jest.clearAllMocks();
  (prisma.dailyScanSummary.findFirst as jest.Mock).mockResolvedValue(current());
  (prisma.dailyScanSummary.findUnique as jest.Mock).mockResolvedValue({createdAt:current().createdAt});
  (prisma.dailyScanSummary.aggregate as jest.Mock).mockResolvedValue({_sum:{evaluated:20}});
  (prisma.stockDailySnapshot.groupBy as jest.Mock).mockResolvedValue([{scoringVersion:SCORING_VERSION,_count:{_all:10}}]);
  (prisma.$queryRaw as jest.Mock).mockResolvedValue([{dump_symbols_6mo:BigInt(479),dump_symbols_30d:BigInt(3),flag_symbols_7d:BigInt(4),flag_symbols_30d:BigInt(5),pumping_now:BigInt(8)}]);
 });
 afterEach(()=>jest.useRealTimers());
 it.each([
  ['missing',null],
  ['stale',{...current(),scanDate:new Date('2026-10-22')}],
  ['legacy',{...current(),artifactRevisionId:null,artifactRevision:null}],
  ['unpublished',{...current(),artifactRevision:{status:'FAILED'}}],
  ['inconsistent',{...current(),highRiskCount:5000,evaluated:9200}],
 ])('does not expose %s legacy totals in public homepage tiles',async(_kind,row)=>{
  (prisma.dailyScanSummary.findFirst as jest.Mock).mockResolvedValue(row);
  const response=await GET(),body=await response.json();
  expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toContain('no-store');
  expect(body).toMatchObject({status:'UNAVAILABLE',lastScanDate:null,summaryCreatedAt:null,stocksPerDay:null,highRiskLastScan:null,totalScans:null,dumpsConfirmed6mo:479,pumpingNow:8});
  expect(prisma.dailyScanSummary.findUnique).not.toHaveBeenCalled();
 });
 it('hides scan counters when the snapshot cohort mixes scoring versions',async()=>{
  (prisma.stockDailySnapshot.groupBy as jest.Mock).mockResolvedValue([{scoringVersion:SCORING_VERSION,_count:{_all:9}},{scoringVersion:'old',_count:{_all:1}}]);
  const body=await(await GET()).json();expect(body.stocksPerDay).toBeNull();expect(body.highRiskLastScan).toBeNull();expect(body.totalScans).toBeNull();
 });
 it('returns exact verified counters and creation metadata without inventing publication time',async()=>{
  const response=await GET(),body=await response.json();
  expect(body).toMatchObject({status:'AVAILABLE',lastScanDate:'2026-10-23T00:00:00.000Z',summaryCreatedAt:'2026-10-24T07:00:00.000Z',stocksPerDay:10,highRiskLastScan:2,totalScans:20});
  expect(body).not.toHaveProperty('publishedAt');
  expect(prisma.dailyScanSummary.findUnique).toHaveBeenCalledWith({where:{scanDate:new Date('2026-10-23')},select:{createdAt:true}});
  expect(response.headers.get('Cache-Control')).toContain('no-store');
 });
 it('does not allow yesterday\'s cached statistics after a newer publication',async()=>{
  const oldResponse=await GET();jest.setSystemTime(new Date('2026-10-27T06:25:00Z'));
  (prisma.dailyScanSummary.findFirst as jest.Mock).mockResolvedValue({...current(),scanDate:new Date('2026-10-26')});
  (prisma.dailyScanSummary.findUnique as jest.Mock).mockResolvedValue({createdAt:new Date('2026-10-27T03:00:00Z')});
  const newResponse=await GET(),body=await newResponse.json();
  expect(oldResponse.headers.get('Cache-Control')).toContain('no-store');expect(newResponse.headers.get('Cache-Control')).toContain('no-store');
  expect(body.lastScanDate).toBe('2026-10-26T00:00:00.000Z');expect(body.summaryCreatedAt).toBe('2026-10-27T03:00:00.000Z');
 });
 it('updates same-date corrected counts while preserving the original creation time',async()=>{
  const original=await(await GET()).json();
  (prisma.dailyScanSummary.findFirst as jest.Mock).mockResolvedValue({...current(),lowRiskCount:2,highRiskCount:5});
  const corrected=await(await GET()).json();expect(corrected.highRiskLastScan).toBe(5);expect(corrected.summaryCreatedAt).toBe(original.summaryCreatedAt);
 });
});
