import { fetchJson, loadChunk } from '../game/data.ts';
import type { Candidate, Manifest, Profile } from '../game/types.ts';
import { decodeDraftCards, type StoredDraftCardTable } from './card-table.ts';
import { decodeParkFit, type StoredParkFit } from './park-fit.ts';
import type { DraftCard } from './types.ts';

const dataUrl = (manifest: Manifest, filename: string) => `/data/${manifest.dataVersion}/${filename}`;

/** The data version's priced cards. */
export async function loadDraftCards(manifest: Manifest): Promise<DraftCard[]> {
 const table = await fetchJson<StoredDraftCardTable>(dataUrl(manifest, 'draft-cards.json'));
 return decodeDraftCards(manifest.candidates, table, manifest.dataVersion);
}

/** Home-half park fits in runs for `franchiseIds`, by franchise then season id. */
export async function loadParkFits(manifest: Manifest, franchiseIds: readonly string[]): Promise<Map<string, Map<string, number>>> {
 return new Map(await Promise.all(franchiseIds.map(async id => {
  const stored = await fetchJson<StoredParkFit>(dataUrl(manifest, `draft-park-${id}.json`));
  return [id, decodeParkFit(manifest.candidates, stored, manifest.dataVersion)] as const;
 })));
}

/**
 * Card profiles by season id, loaded a franchise-decade chunk at a time and kept for the tab.
 * Names and statistics live only in the chunks, so cards appear as their chunks arrive.
 */
export class ProfileStore {
 readonly #manifest: Manifest;
 readonly #candidates: Map<string, Candidate>;
 readonly #profiles = new Map<string, Profile>();
 readonly #chunks = new Map<string, Promise<void>>();

 constructor(manifest: Manifest) {
  this.#manifest = manifest;
  this.#candidates = new Map(manifest.candidates.map(candidate => [candidate.seasonId, candidate]));
 }

 get(seasonId: string): Profile | undefined { return this.#profiles.get(seasonId); }

 /** Loads every chunk the ids need; rejects if a chunk fails or lacks an id. */
 async load(seasonIds: Iterable<string>): Promise<Map<string, Profile>> {
  const ids = [...seasonIds];
  const keys = new Map<string, Candidate>();
  for (const id of ids) {
   if (this.#profiles.has(id)) continue;
   const candidate = this.#candidates.get(id);
   if (!candidate) throw new Error(`Card ${id} is not in this dataset`);
   keys.set(`${candidate.franchiseId}-${candidate.decade}`, candidate);
  }
  await Promise.all([...keys].map(([key, candidate]) => {
   let pending = this.#chunks.get(key);
   if (!pending) {
    pending = loadChunk(this.#manifest, candidate).then(profiles => { for (const profile of profiles) this.#profiles.set(profile.seasonId, profile); });
    pending.catch(() => this.#chunks.delete(key));
    this.#chunks.set(key, pending);
   }
   return pending;
  }));
  return new Map(ids.map(id => {
   const profile = this.#profiles.get(id);
   if (!profile) throw new Error(`Card ${id} is missing from its data chunk`);
   return [id, profile];
  }));
 }
}
