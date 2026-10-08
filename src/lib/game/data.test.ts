import { afterEach, describe, expect, it, vi } from 'vitest';
import { neutralDefensivePosition } from '../sim/defense.ts';
import { syntheticProfile } from '../sim/fixtures.ts';
import { testSeason } from '../sim/test-fixtures.ts';
import { loadChunk, loadManifest, loadShowcase, loadSimulation } from './data.ts';
import type { HitterSlot, Manifest, Profile, ShowcaseCard, SimulationData } from './types.ts';

function profile(id: string, decade: number, slot: HitterSlot = 'DH'): Profile {
 const value = syntheticProfile(id);
 value.seasonId = `${id}:${decade}:AL:F${decade}`;
 value.year = decade;
 value.franchiseId = `F${decade}`;
 value.teamId = `T${decade}`;
 value.eligibleSlots = [slot];
 value.primaryHitterSlot = slot;
 value.appearances = { [slot]: 100 };
 value.defense = { positions: slot === 'DH' ? {} : { [slot]: neutralDefensivePosition(slot) } };
 return value;
}

function manifest(version: string, profiles: Profile[] = []): Manifest {
 const candidates = profiles.map(value => ({
  seasonId: value.seasonId,
  playerId: value.playerId,
  franchiseId: value.franchiseId,
  decade: Math.floor(value.year / 10) * 10,
  eligibleSlots: [...value.eligibleSlots]
 }));
 const chunkKeys = new Set(candidates.map(candidate => `${candidate.franchiseId}-${candidate.decade}`));
 const chunks = Object.fromEntries([...chunkKeys].map(key => [key, `/data/${version}/${key}.json`]));
 return {
  schemaVersion: 1,
  dataVersion: version,
  sourceCommit: 'fixture',
  franchises: Array.from({ length: 30 }, (_, index) => ({ id: `F${index}`, name: `Club ${index}`, decades: [2020] })),
  candidates,
  chunks,
  simulationUrl: `/data/${version}/simulation.json`,
  showcaseUrl: `/data/${version}/showcase.json`,
  attributionUrl: `/data/${version}/attribution.json`,
  archiveUrl: `/data/${version}/transformed-data.tar.gz`,
  attribution: { title: 'Fixture', credit: 'Fixture', sourceUrl: 'https://example.invalid/source', license: 'Fixture', licenseUrl: 'https://example.invalid/license', sourceCommit: 'fixture', changes: 'Fixture', fullNotice: 'Fixture' },
  approximations: [],
  coverage: [],
  diagnostics: { excludedBatting: 0, excludedPitching: 0, excludedProfiles: 0, estimatedProfiles: 0, reportUrl: `/data/${version}/diagnostics.json` }
 };
}

function showcaseCards(): ShowcaseCard[] {
 return Array.from({ length: 32 }, (_, index) => {
  const value = profile(`showcase-${index}`, 1950 + Math.floor(index / 4) * 10);
  const slot = value.eligibleSlots[0];
  if (!slot) throw new Error('Showcase fixture requires an eligible slot');
  return { profile: value, slot };
 });
}

function simulationData(version: string): SimulationData {
 const data = structuredClone(testSeason().data);
 data.dataVersion = version;
 data.bullpen.batting = undefined;
 data.bullpen.battingRates = undefined;
 data.bullpen.primaryHitterSlot = null;
 data.bullpen.appearances = {};
 data.bullpen.fielding = {};
 data.bullpen.defense = { positions: {} };
 return data;
}

afterEach(() => vi.unstubAllGlobals());

describe('canonical profile loading', () => {
 it('rejects a chunk profile whose required defensive position is missing', async () => {
  const version = 'c'.repeat(64);
  const corrupt = profile('missing-defense', 2020, 'C');
  delete corrupt.defense.positions.C;
  const dataManifest = manifest(version, [corrupt]);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([corrupt])));

  await expect(loadChunk(dataManifest, { franchiseId: corrupt.franchiseId, decade: 2020 }))
   .rejects.toThrow();
 });

 it('rejects corrupt opponent defense before simulation preparation', async () => {
  const version = 'd'.repeat(64);
  const data = simulationData(version);
  const catcher = data.opponents[0].hitters.find(value => value.eligibleSlots[0] === 'C')!;
  delete catcher.defense.positions.C;
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(data)));

  await expect(loadSimulation(manifest(version))).rejects.toThrow();
 });

 it('requires the current simulation method versions', async () => {
  const version = 'e'.repeat(64);
  const current = simulationData(version);
  const obsolete = { ...current, defenseMethodVersion: 'obsolete' };
  let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(++reads === 1 ? obsolete : current)));

  await expect(loadSimulation(manifest(version))).rejects.toThrow();
  const loaded = await loadSimulation(manifest(version));
  expect(loaded).toMatchObject({ dataVersion: version, defenseMethodVersion: 'defense-v1', valuationVersion: 'sim-war-v1' });
  expect(loaded.opponents).toHaveLength(30);
  expect(reads).toBe(2);
 });

 it('rejects an invalid defensive environment', async () => {
  const version = '9'.repeat(64);
  const data = simulationData(version);
  data.leagueErrorRates.C = -0.01;
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(data)));

  await expect(loadSimulation(manifest(version))).rejects.toThrow();
 });
});

describe('bounded canonical showcase loading', () => {
 it('loads exactly four unique canonical profiles per era and retries after invalid publication data', async () => {
  const version = 'a'.repeat(64);
  const cards = showcaseCards();
  const dataManifest = manifest(version, cards.map(card => card.profile));
  let reads = 0;
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(++reads === 1 ? cards.slice(1) : cards)));
  await expect(loadShowcase(dataManifest)).rejects.toThrow();
  await expect(loadShowcase(dataManifest)).resolves.toEqual(cards);
  expect(reads).toBe(2);
 });

 it('rejects a showcase profile that does not match its canonical chunk identity', async () => {
  const version = 'b'.repeat(64);
  const cards = showcaseCards();
  const dataManifest = manifest(version, cards.map(card => card.profile));
  cards[0].profile.playerId = 'other-player';
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(cards)));

  await expect(loadShowcase(dataManifest)).rejects.toThrow();
 });

 it('rejects a rendering slot the canonical profile cannot fill', async () => {
  const version = '7'.repeat(64);
  const cards = showcaseCards();
  const dataManifest = manifest(version, cards.map(card => card.profile));
  cards[0].slot = 'SP1';
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(cards)));

  await expect(loadShowcase(dataManifest)).rejects.toThrow();
 });

 it('rejects a manifest whose showcase is not at its content-addressed path', async () => {
  const version = 'f'.repeat(64);
  const dataManifest = manifest(version);
  dataManifest.showcaseUrl = '/data/showcase.json';
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
   const url = String(input);
   if (url === '/data/current.json') {
    return Response.json({ schemaVersion: 1, dataVersion: version, manifestUrl: `/data/${version}/manifest.json` });
   }
   return Response.json(dataManifest);
  }));

  await expect(loadManifest()).rejects.toThrow();
 });
});
