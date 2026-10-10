import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { availableCandidates, createDraft, legalSlots, rollDraft, selectHomeStadium } from '../lib/game/draft.ts';
import type { Candidate, Draft, Manifest, Profile, Slot } from '../lib/game/types.ts';
import type { MediaManifest, MediaPointer } from '../lib/media/types.ts';
import type { WarRankings, WarRankingsPointer } from '../lib/rankings/types.ts';

export const STORAGE_KEY = '162-zero:v1';

export interface CardScenario {
 draft: Draft;
 candidate: Candidate;
 profile: Profile;
 profiles: Profile[];
 slot: Slot;
}

export async function currentManifest(request: APIRequestContext): Promise<Manifest> {
 const pointerResponse = await request.get('/data/current.json');
 expect(pointerResponse.ok()).toBe(true);
 const pointer = await pointerResponse.json() as { manifestUrl: string };
 const manifestResponse = await request.get(pointer.manifestUrl);
 expect(manifestResponse.ok()).toBe(true);
 return manifestResponse.json() as Promise<Manifest>;
}

export async function currentMedia(request: APIRequestContext): Promise<MediaManifest> {
 const pointerResponse = await request.get('/media/current.json');
 expect(pointerResponse.ok()).toBe(true);
 const pointer = await pointerResponse.json() as MediaPointer;
 const manifestResponse = await request.get(pointer.manifestUrl);
 expect(manifestResponse.ok()).toBe(true);
 return manifestResponse.json() as Promise<MediaManifest>;
}

export async function currentRankings(request: APIRequestContext): Promise<WarRankings> {
 const pointerResponse = await request.get('/rankings/current.json');
 expect(pointerResponse.ok()).toBe(true);
 const pointer = await pointerResponse.json() as WarRankingsPointer;
 const manifestResponse = await request.get(pointer.manifestUrl);
 expect(manifestResponse.ok()).toBe(true);
 return manifestResponse.json() as Promise<WarRankings>;
}

export async function cardScenario(
 request: APIRequestContext,
 manifest: Manifest,
 accept: (candidate: Candidate, profile: Profile) => boolean
): Promise<CardScenario> {
 const profilesByChunk = new Map<string, Profile[]>();
 for (let seed = 1; seed <= 500; seed++) {
  const draft = rollDraft(selectHomeStadium(createDraft(manifest, seed), manifest, manifest.stadiums[0].ref.id), manifest);
  if (!draft.currentRoll) continue;
  const chunkUrl = manifest.chunks[`${draft.currentRoll.franchiseId}-${draft.currentRoll.decade}`];
  let profiles = profilesByChunk.get(chunkUrl);
  if (!profiles) {
   const response = await request.get(chunkUrl);
   expect(response.ok()).toBe(true);
   profiles = await response.json() as Profile[];
   profilesByChunk.set(chunkUrl, profiles);
  }
  for (const candidate of availableCandidates(draft, manifest)) {
   const profile = profiles.find(item => item.seasonId === candidate.seasonId);
   const slot = legalSlots(draft, candidate, manifest)[0];
   if (profile && slot && accept(candidate, profile)) return { draft, candidate, profile, profiles, slot };
  }
 }
 throw new Error('Current data did not produce the requested card scenario in 500 deterministic rolls');
}

export async function openSavedDraft(page: Page, draft: Draft): Promise<void> {
 const saved = JSON.stringify({ ...draft, phase: 'draft' });
 await page.addInitScript(({ key, value }) => {
  if (!localStorage.getItem(key)) localStorage.setItem(key, value);
 }, { key: STORAGE_KEY, value: saved });
 await page.goto('/');
 await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
 await expect(page.getByRole('searchbox', { name: 'Find your pick' })).toBeVisible();
}

/** Picks the first stadium in the deck; the session rolls the first franchise right after. */
export async function chooseStadium(page: Page): Promise<void> {
 const deck = page.getByRole('region', { name: 'Choose your home stadium' });
 await deck.getByRole('radio').first().check();
 await deck.getByRole('button', { name: 'Draft at this stadium', exact: true }).click();
}
