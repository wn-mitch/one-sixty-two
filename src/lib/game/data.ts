import type { Manifest, Profile, Roll, SimulationData } from './types.ts';
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
  if (!value || value.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(value.dataVersion) || value.manifestUrl !== `/data/${value.dataVersion}/manifest.json`) throw new Error('Dataset version is incompatible');
 });
 return fetchJson<Manifest>(current.manifestUrl, manifest => {
  if (!manifest || manifest.schemaVersion !== 1 || manifest.dataVersion !== current.dataVersion || !Array.isArray(manifest.franchises) || manifest.franchises.length !== 30 || !Array.isArray(manifest.candidates)) throw new Error('Dataset manifest is incompatible');
 });
}
export async function loadChunk(manifest: Manifest, roll: Roll): Promise<Profile[]> {
 const url = manifest.chunks[`${roll.franchiseId}-${roll.decade}`];
 if (!url) throw new Error('Dataset error: no chunk for the committed roll');
 const expected = new Map(manifest.candidates.filter(candidate => candidate.franchiseId === roll.franchiseId && candidate.decade === roll.decade).map(candidate => [candidate.seasonId, candidate]));
 return fetchJson<Profile[]>(url, profiles => {
  if (!Array.isArray(profiles) || !profiles.length || profiles.length !== expected.size || new Set(profiles.map(profile => profile?.seasonId)).size !== expected.size || profiles.some(profile => {
   const candidate = profile && expected.get(profile.seasonId);
   return !candidate || profile.playerId !== candidate.playerId || profile.franchiseId !== roll.franchiseId || Math.floor(profile.year / 10) * 10 !== roll.decade;
  })) throw new Error('Dataset error: the loaded seasons do not match this roll. Your draft is preserved. Please retry.');
 });
}
export async function loadSimulation(manifest: Manifest): Promise<SimulationData> {
 return fetchJson<SimulationData>(manifest.simulationUrl, data => {
  if (!data || data.schemaVersion !== 1 || data.dataVersion !== manifest.dataVersion || !Array.isArray(data.opponents) || data.opponents.length !== 30) throw new Error('Simulation dataset is incompatible');
 });
}
