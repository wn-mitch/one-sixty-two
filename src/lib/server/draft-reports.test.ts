import { describe, expect, it } from 'vitest';
import { DRAFT_REPORT_SCHEMA, type DraftSharedReport } from '../draft/share-report.ts';
import { LEAGUE_VERSION, RUN_VERSION } from '../draft/versions.ts';
import { MODEL_VERSION, RULES_VERSION } from '../game/types.ts';
import type { ReplayBucket, ReplayPutOptions } from './replays.ts';
import { DRAFT_REPORT_PREFIX, loadDraftReport, loadDraftReportImage, publishDraftReport } from './draft-reports.ts';
import { ShareIncompatibleError, ShareInvalidError, ShareNotFoundError, type ShareServerBindings } from './share-images.ts';

const DATA = 'a'.repeat(64);

class MemoryBucket implements ReplayBucket {
 objects = new Map<string, Uint8Array>();
 async get(key: string) { const body = this.objects.get(key); return body ? { body } : null; }
 async put(key: string, value: ArrayBuffer | Uint8Array | string, options?: ReplayPutOptions) {
  if (options?.onlyIf?.etagDoesNotMatch === '*' && this.objects.has(key)) return null;
  this.objects.set(key, typeof value === 'string' ? new TextEncoder().encode(value) : Uint8Array.from(new Uint8Array(value)));
  return {};
 }
}

function png(width: number, height: number, marker = 0): Uint8Array<ArrayBuffer> {
 const bytes = new Uint8Array(25);
 bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82], 0);
 const view = new DataView(bytes.buffer);
 view.setUint32(16, width, false);
 view.setUint32(20, height, false);
 bytes[24] = marker;
 return bytes;
}

const line = (club: string, innings: (number | null)[]) => ({ club, innings, runs: innings.reduce<number>((sum, runs) => sum + (runs ?? 0), 0) });
function sampleReport(overrides: Partial<DraftSharedReport> = {}): DraftSharedReport {
 return {
  schemaVersion: DRAFT_REPORT_SCHEMA, runVersion: RUN_VERSION, leagueVersion: LEAGUE_VERSION, modelVersion: MODEL_VERSION, rulesVersion: RULES_VERSION, dataVersion: DATA,
  seed: 162, franchiseId: 'CIN', club: 'Cincinnati Reds', record: { wins: 94, losses: 68, runsFor: 780, runsAgainst: 690 }, place: 1, grade: 'S',
  rival: { club: 'Pittsburgh Pirates', wins: 13, losses: 10 },
  standings: Array.from({ length: 8 }, (_, index) => ({ club: `Club ${index}`, wins: 94 - index, losses: 68 + index, runsFor: 700, runsAgainst: 700, gamesBack: index, you: index === 0, rival: index === 3 })),
  decrees: ['Last Call', 'Overtime Mandate', 'Four-Out Baseball', 'Two-Out Express', 'No Free Passes', 'Double Jeopardy'],
  roster: [{ label: 'Joey Votto 2010', slot: '1B', line: '.324 AVG · 37 HR · 113 RBI' }],
  moments: [{ kind: 'highlight', title: 'Walk-off win from 2 down vs Boston, game 21', decree: 'Last Call', away: line('Boston', [2, 0, 0, 0, 0, 0, 0]), home: line('Cincinnati', [0, 0, 1, 0, 0, 0, 2]) }],
  ...overrides
 };
}

describe('shared Draft reports', () => {
 const bindings = (): ShareServerBindings & { REPLAYS: MemoryBucket } => ({ REPLAYS: new MemoryBucket(), PUBLIC_ORIGIN: 'https://game.example/' });

 it('publishes a season under a content address, reads it back, and keeps the first card image', async () => {
  const env = bindings();
  const report = sampleReport();
  const first = await publishDraftReport(env, report, png(1200, 630, 1), DATA);
  expect(first.url).toBe(`https://game.example/d/${first.id}`);
  // Key order and unknown fields do not change the address; a second browser's drawing does not replace the first.
  const again = await publishDraftReport(env, { extra: 'ignored', ...report }, png(1200, 630, 2), DATA);
  expect(again.id).toBe(first.id);
  expect((await loadDraftReportImage(env, first.id))[24]).toBe(1);
  expect(await loadDraftReport(env, first.id)).toEqual({ report, image: true });
  expect([...env.REPLAYS.objects.keys()].every(key => key.startsWith(DRAFT_REPORT_PREFIX))).toBe(true);
  const other = await publishDraftReport(env, sampleReport({ seed: 7 }), null, DATA);
  expect(other.id).not.toBe(first.id);
  expect((await loadDraftReport(env, other.id)).image).toBe(false);
  await expect(loadDraftReportImage(env, other.id)).rejects.toBeInstanceOf(ShareNotFoundError);
 });

 it('accepts only current-build seasons, but still shows one published by an earlier build', async () => {
  const env = bindings();
  await expect(publishDraftReport(env, sampleReport(), null, 'b'.repeat(64))).rejects.toBeInstanceOf(ShareIncompatibleError);
  await expect(publishDraftReport(env, sampleReport({ leagueVersion: 'league-v1' }), null, DATA)).rejects.toBeInstanceOf(ShareIncompatibleError);
  const { id } = await publishDraftReport(env, sampleReport(), null, DATA);
  // A later release moves every version on; the stored snapshot still reads.
  expect((await loadDraftReport(env, id)).report.leagueVersion).toBe(LEAGUE_VERSION);
  const key = `${DRAFT_REPORT_PREFIX}${id}.json`;
  env.REPLAYS.objects.set(key, new TextEncoder().encode(JSON.stringify(sampleReport({ leagueVersion: 'league-v99', runVersion: 'draft-run-v99' }))));
  expect((await loadDraftReport(env, id)).report.leagueVersion).toBe('league-v99');
 });

 it('refuses malformed seasons and images', async () => {
  const env = bindings();
  const bad: unknown[] = [
   { ...sampleReport(), schemaVersion: 2 },
   { ...sampleReport(), record: { wins: 94, losses: 67, runsFor: 1, runsAgainst: 1 } },
   { ...sampleReport(), club: 'x'.repeat(121) },
   { ...sampleReport(), standings: sampleReport().standings.map(row => ({ ...row, you: true })) },
   { ...sampleReport(), decrees: ['Last Call'] },
   { ...sampleReport(), grade: 'A+' },
   { ...sampleReport(), moments: [{ ...sampleReport().moments[0], kind: 'other' }] }
  ];
  for (const report of bad) await expect(publishDraftReport(env, report, null, DATA)).rejects.toBeInstanceOf(ShareInvalidError);
  await expect(publishDraftReport(env, sampleReport(), png(1080, 1920), DATA)).rejects.toBeInstanceOf(ShareInvalidError);
  await expect(publishDraftReport(env, sampleReport(), new Uint8Array([1, 2, 3]), DATA)).rejects.toBeInstanceOf(ShareInvalidError);
  expect(env.REPLAYS.objects.size).toBe(0);
  await expect(loadDraftReport(env, 'not-an-id')).rejects.toBeInstanceOf(ShareNotFoundError);
  await expect(loadDraftReport(env, 'S'.repeat(22))).rejects.toBeInstanceOf(ShareNotFoundError);
 });
});
