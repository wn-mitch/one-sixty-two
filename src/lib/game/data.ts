import { POSITIONS, SLOTS, type Manifest, type Position, type Profile, type Roll, type ShowcaseCard, type SimulationData } from './types.ts';
import { validateDefensiveEnvironment, validateProfile, validateTeam } from '../sim/validation.ts';

const DATA_VERSION = /^[a-f0-9]{64}$/;
const SHOWCASE_ERAS = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020] as const;

function versionedDataUrl(manifest: Manifest, filename: string): string {
 return `/data/${manifest.dataVersion}/${filename}`;
}

function validateCanonicalProfile(profile: Profile | null | undefined): asserts profile is Profile {
 if (!profile || typeof profile !== 'object') throw new Error('Dataset contains an invalid profile');
 validateProfile(profile);
}

function matchesCandidate(profile: Profile, candidate: Manifest['candidates'][number]): boolean {
 return profile.seasonId === candidate.seasonId &&
  profile.playerId === candidate.playerId &&
  profile.franchiseId === candidate.franchiseId &&
  Math.floor(profile.year / 10) * 10 === candidate.decade &&
  profile.eligibleSlots.length === candidate.eligibleSlots.length &&
  profile.eligibleSlots.every((slot, index) => slot === candidate.eligibleSlots[index]);
}

function validateShowcaseUrl(manifest: Manifest): void {
 if (!DATA_VERSION.test(manifest.dataVersion) ||
  manifest.showcaseUrl !== versionedDataUrl(manifest, 'showcase.json')) {
  throw new Error('Dataset showcase is incompatible');
 }
}
const responses = new Map<string, Promise<unknown>>();
/** Cache immutable responses; share concurrent pointer loads without retaining mutable current.json. */
export async function fetchJson<T>(url: string, validate?: (value: T) => void): Promise<T> {
 const mutable = url.endsWith('/current.json');
 let pending = responses.get(url);
 if (!pending) {
  pending = fetch(url, { cache: mutable ? 'no-cache' : 'default' }).then(async response => {
   if (!response.ok) throw new Error(`Data request failed (${response.status}). Please retry.`);
   return response.json() as Promise<unknown>;
  });
  responses.set(url, pending);
 }
 try {
  const value = await pending as T;
  validate?.(value);
  return value;
 }
 catch (error) { if (responses.get(url) === pending) responses.delete(url); throw error; }
 finally { if (mutable && responses.get(url) === pending) responses.delete(url); }
}
export async function loadManifest(): Promise<Manifest> {
 const current = await fetchJson<{ schemaVersion: number; dataVersion: string; manifestUrl: string }>('/data/current.json', value => {
  if (!value || value.schemaVersion !== 1 || !DATA_VERSION.test(value.dataVersion) || value.manifestUrl !== `/data/${value.dataVersion}/manifest.json`) throw new Error('Dataset version is incompatible');
 });
 return fetchJson<Manifest>(current.manifestUrl, manifest => {
  if (!manifest || manifest.schemaVersion !== 1 || manifest.dataVersion !== current.dataVersion || !Array.isArray(manifest.franchises) || manifest.franchises.length !== 30 || !Array.isArray(manifest.candidates)) throw new Error('Dataset manifest is incompatible');
  validateShowcaseUrl(manifest);
 });
}
export async function loadChunk(manifest: Manifest, roll: Roll): Promise<Profile[]> {
 const url = manifest.chunks[`${roll.franchiseId}-${roll.decade}`];
 if (!url) throw new Error('Dataset error: no chunk for the committed roll');
 const expected = new Map(manifest.candidates.filter(candidate => candidate.franchiseId === roll.franchiseId && candidate.decade === roll.decade).map(candidate => [candidate.seasonId, candidate]));
 return fetchJson<Profile[]>(url, profiles => {
  if (!Array.isArray(profiles) || !profiles.length) {
   throw new Error('Dataset error: the loaded seasons do not match this roll. Your draft is preserved. Please retry.');
  }
  profiles.forEach(validateCanonicalProfile);
  if (profiles.length !== expected.size || new Set(profiles.map(profile => profile.seasonId)).size !== expected.size || profiles.some(profile => {
   const candidate = expected.get(profile.seasonId);
   return !candidate || !matchesCandidate(profile, candidate);
  })) throw new Error('Dataset error: the loaded seasons do not match this roll. Your draft is preserved. Please retry.');
 });
}

export async function loadShowcase(manifest: Manifest): Promise<ShowcaseCard[]> {
 validateShowcaseUrl(manifest);
 const candidates = new Map(manifest.candidates.map(candidate => [candidate.seasonId, candidate]));
 return fetchJson<ShowcaseCard[]>(manifest.showcaseUrl, cards => {
  if (!Array.isArray(cards) || cards.length !== 32) throw new Error('Dataset showcase is incompatible');
  const seasonIds = new Set<string>();
  const eraCounts = new Map<number, number>();
  for (const card of cards) {
   if (!card || typeof card !== 'object' || !SLOTS.includes(card.slot)) {
    throw new Error('Dataset showcase is incompatible');
   }
   const profile = card.profile;
   validateCanonicalProfile(profile);
   const candidate = candidates.get(profile.seasonId);
   const decade = Math.floor(profile.year / 10) * 10;
   if (seasonIds.has(profile.seasonId) || !profile.eligibleSlots.includes(card.slot) ||
    !candidate || !matchesCandidate(profile, candidate) ||
    !SHOWCASE_ERAS.includes(decade as typeof SHOWCASE_ERAS[number]) ||
    manifest.chunks[`${candidate.franchiseId}-${candidate.decade}`] !==
     versionedDataUrl(manifest, `${candidate.franchiseId}-${candidate.decade}.json`)) {
    throw new Error('Dataset showcase is incompatible');
   }
   seasonIds.add(profile.seasonId);
   eraCounts.set(decade, (eraCounts.get(decade) ?? 0) + 1);
  }
  if (seasonIds.size !== 32 ||
   SHOWCASE_ERAS.some(decade => eraCounts.get(decade) !== 4) ||
   eraCounts.size !== SHOWCASE_ERAS.length) {
   throw new Error('Dataset showcase is incompatible');
  }
 });
}
export async function loadSimulation(manifest: Manifest): Promise<SimulationData> {
 return fetchJson<SimulationData>(manifest.simulationUrl, data => {
  if (!data || data.schemaVersion !== 1 || data.dataVersion !== manifest.dataVersion ||
   data.defenseMethodVersion !== 'defense-v1' || data.valuationVersion !== 'sim-war-v1' ||
   !Number.isFinite(data.observedRuns) || data.observedRuns <= 0 ||
   !Array.isArray(data.opponents) || data.opponents.length !== 30 ||
   new Set(data.opponents.map(opponent => opponent?.id)).size !== 30) {
   throw new Error('Simulation dataset is incompatible');
  }
  validateDefensiveEnvironment(data);
  validateCanonicalProfile(data.bullpen);
  for (const opponent of data.opponents) {
   if (!opponent || typeof opponent.id !== 'string' || !opponent.id ||
    typeof opponent.name !== 'string' || !opponent.name ||
    !Number.isFinite(opponent.park) || opponent.park <= 0 ||
    !Array.isArray(opponent.hitters) || opponent.hitters.length !== 9 ||
    !Array.isArray(opponent.starters) || opponent.starters.length !== 5 ||
    !opponent.closer || !opponent.bullpen) {
    throw new Error('Simulation dataset is incompatible');
   }
   const pitchers = [...opponent.starters, opponent.closer, opponent.bullpen];
   for (const profile of [...opponent.hitters, ...pitchers]) validateCanonicalProfile(profile);
   if (opponent.starters.some(profile => !profile.pitching || profile.pitching.GS <= 0)) {
    throw new Error('Simulation dataset is incompatible');
   }
   const defense = Object.fromEntries(POSITIONS.map(position => [
    position,
    opponent.hitters.findIndex(profile => profile.eligibleSlots.length === 1 && profile.eligibleSlots[0] === position)
   ])) as Record<Position, number>;
   validateTeam({
    id: opponent.id,
    name: opponent.name,
    hitters: opponent.hitters,
    defense,
    pitchers,
    starterIndex: 0,
    closerIndex: 5,
    bullpenIndex: 6,
    closerAvailable: true,
    closerOutsRemaining: 0
   });
  }
 });
}
