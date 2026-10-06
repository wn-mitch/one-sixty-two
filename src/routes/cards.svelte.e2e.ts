import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { availableCandidates, createDraft, legalSlots, rollDraft } from '../lib/game/draft.ts';
import type { Candidate, Draft, Manifest, Profile, Slot } from '../lib/game/types.ts';
import { selectPhoto } from '../lib/media/client.ts';
import type { MediaManifest, MediaPointer } from '../lib/media/types.ts';

const STORAGE_KEY = '162-zero:v1';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(180000);

interface CardScenario {
	draft: Draft;
	candidate: Candidate;
	profile: Profile;
	profiles: Profile[];
	slot: Slot;
}

async function currentManifest(request: APIRequestContext): Promise<Manifest> {
	const pointerResponse = await request.get('/data/current.json');
	expect(pointerResponse.ok()).toBe(true);
	const pointer = await pointerResponse.json() as { manifestUrl: string };
	const manifestResponse = await request.get(pointer.manifestUrl);
	expect(manifestResponse.ok()).toBe(true);
	return manifestResponse.json() as Promise<Manifest>;
}

async function currentMedia(request: APIRequestContext): Promise<MediaManifest> {
	const pointerResponse = await request.get('/media/current.json');
	expect(pointerResponse.ok()).toBe(true);
	const pointer = await pointerResponse.json() as MediaPointer;
	const manifestResponse = await request.get(pointer.manifestUrl);
	expect(manifestResponse.ok()).toBe(true);
	return manifestResponse.json() as Promise<MediaManifest>;
}

async function cardScenario(
	request: APIRequestContext,
	manifest: Manifest,
	accept: (candidate: Candidate) => boolean
): Promise<CardScenario> {
	for (let seed = 1; seed <= 500; seed++) {
		const draft = rollDraft(createDraft(manifest, seed), manifest);
		const candidate = availableCandidates(draft, manifest).find(accept);
		if (!candidate) continue;
		const slot = legalSlots(draft, candidate, manifest)[0];
		if (!slot || !draft.currentRoll) continue;
		const chunkUrl = manifest.chunks[`${draft.currentRoll.franchiseId}-${draft.currentRoll.decade}`];
		const response = await request.get(chunkUrl);
		expect(response.ok()).toBe(true);
		const profiles = await response.json() as Profile[];
		const profile = profiles.find(item => item.seasonId === candidate.seasonId);
		if (profile) return { draft, candidate, profile, profiles, slot };
	}
	throw new Error('Current data did not produce the requested card scenario in 500 deterministic rolls');
}

async function openSavedDraft(page: Page, draft: Draft): Promise<void> {
	const saved = JSON.stringify({ ...draft, phase: 'draft' });
	await page.addInitScript(({ key, value }) => {
		if (!localStorage.getItem(key)) localStorage.setItem(key, value);
	}, { key: STORAGE_KEY, value: saved });
	await page.goto('/');
	await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
	await expect(page.getByRole('searchbox', { name: 'Find your pick' })).toBeVisible();
}

async function selectExactCard(page: Page, scenario: CardScenario) {
	await page.getByRole('searchbox', { name: 'Find your pick' }).fill(scenario.profile.displayName);
	const group = page.locator(`[data-candidate-group="${scenario.candidate.playerId}"]`);
	const selector = group.getByRole('combobox', { name: `Exact season for ${scenario.profile.displayName}`, exact: true });
	if (await selector.count()) await selector.selectOption(scenario.candidate.seasonId);
	const card = group.locator(`.player-card[data-season-id="${scenario.candidate.seasonId}"]`);
	await expect(card).toBeVisible();
	return card;
}

async function draftSelectedCard(page: Page, scenario: CardScenario): Promise<Draft> {
	const card = await selectExactCard(page, scenario);
	await card.getByRole('button', { name: `Choose ${scenario.profile.year}`, exact: true }).click();
	await expect(card.getByRole('button', { name: 'Clear selection', exact: true })).toBeVisible();
	await page.locator(`.assignment-dock input[value="${scenario.slot}"]`).check();
	await page.getByRole('button', { name: `Draft player at ${scenario.slot}`, exact: true }).click();
	return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY) as Promise<Draft>;
}

test('keeps a changed exact season through both faces and ranking arrival, then drafts that season', async ({ page, request }) => {
	const manifest = await currentManifest(request);
	const seasonsByRoll = new Map<string, Candidate[]>();
	const groupKey = (candidate: Candidate) => `${candidate.franchiseId}:${candidate.decade}:${candidate.playerId}`;
	for (const candidate of manifest.candidates) {
		const seasons = seasonsByRoll.get(groupKey(candidate)) ?? [];
		seasons.push(candidate);
		seasonsByRoll.set(groupKey(candidate), seasons);
	}
	const scenario = await cardScenario(request, manifest, candidate =>
		!candidate.eligibleSlots.includes('BP') && seasonsByRoll.get(groupKey(candidate))!.some(other => other.seasonId !== candidate.seasonId)
	);
	let releaseRankings!: () => void;
	const rankingGate = new Promise<void>(resolve => { releaseRankings = resolve; });
	await page.route('**/rankings/*/manifest.json', async route => { await rankingGate; await route.continue(); });
	try {
		await openSavedDraft(page, scenario.draft);
		await page.getByRole('searchbox', { name: 'Find your pick' }).fill(scenario.profile.displayName);
		const group = page.locator(`[data-candidate-group="${scenario.candidate.playerId}"]`);
		const selector = group.getByRole('combobox', { name: `Exact season for ${scenario.profile.displayName}`, exact: true });
		const initial = await selector.inputValue();
		const profileBySeason = new Map(scenario.profiles.map(profile => [profile.seasonId, profile]));
		const initialYear = profileBySeason.get(initial)!.year;
		const changed = seasonsByRoll.get(groupKey(scenario.candidate))!.find(candidate =>
			profileBySeason.get(candidate.seasonId)!.year !== initialYear && legalSlots(scenario.draft, candidate, manifest).length > 0
		);
		expect(changed).toBeDefined();
		await selector.selectOption(changed!.seasonId);
		const card = group.locator('.player-card');
		const face = card.getByRole('button', { name: /^(Details|Front)$/ });
		await face.click();
		await expect(face).toBeFocused();
		await expect(card.locator('.back')).toBeVisible();
		await face.click();
		await expect(face).toBeFocused();
		await expect(card.locator('.front')).toBeVisible();
		releaseRankings();
		await expect(page.getByText('Loading composite WAR/162')).toHaveCount(0);
		await expect(selector).toHaveValue(changed!.seasonId);
		await expect(card).toHaveAttribute('data-season-id', changed!.seasonId);
		await card.getByRole('button', { name: `Choose ${profileBySeason.get(changed!.seasonId)!.year}`, exact: true }).click();
		const slot = legalSlots(scenario.draft, changed!, manifest)[0];
		await page.locator(`.assignment-dock input[value="${slot}"]`).check();
		await page.getByRole('button', { name: `Draft player at ${slot}`, exact: true }).click();
		await expect(page.getByRole('button', { name: /Roll next franchise/ })).toBeVisible();
		const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY) as Draft;
		expect(saved.picks.at(-1)?.seasonId).toBe(changed!.seasonId);
		expect(saved.actions?.at(-1)).toEqual({ type: 'pick', seasonId: changed!.seasonId, slot });
	} finally {
		releaseRankings();
	}
});

test('keeps a no-photo card draftable when ranking enrichment is unavailable', async ({ page, request }) => {
	const [manifest, media] = await Promise.all([currentManifest(request), currentMedia(request)]);
	const scenario = await cardScenario(request, manifest, candidate =>
		!candidate.eligibleSlots.includes('BP') && !media.players[candidate.playerId]?.photos.length
	);
	await page.route('**/rankings/current.json', route => route.abort());
	await openSavedDraft(page, scenario.draft);
	const card = await selectExactCard(page, scenario);
	await expect(card.getByText('No verified photo', { exact: true })).toBeVisible();
	await expect(page.getByText('Composite WAR/162 is unavailable.')).toBeVisible();
	await expect(card).toContainText(/WAR\/162.*Unavailable/i);
	const saved = await draftSelectedCard(page, scenario);
	expect(saved.picks.at(-1)?.seasonId).toBe(scenario.candidate.seasonId);
});

test('an image load failure preserves the chosen exact season and draft action', async ({ page, request }) => {
	const [manifest, media] = await Promise.all([currentManifest(request), currentMedia(request)]);
	const scenario = await cardScenario(request, manifest, candidate =>
		!candidate.eligibleSlots.includes('BP') && !!media.players[candidate.playerId]?.photos.length
	);
	const photo = selectPhoto(media, scenario.candidate.playerId, scenario.profile.year);
	expect(photo).not.toBeNull();
	await page.route(`**${photo!.url}`, route => route.abort());
	await openSavedDraft(page, scenario.draft);
	const card = await selectExactCard(page, scenario);
	await card.scrollIntoViewIfNeeded();
	await expect(card.getByText('Photo unavailable', { exact: true })).toBeVisible();
	const saved = await draftSelectedCard(page, scenario);
	expect(saved.picks.at(-1)?.seasonId).toBe(scenario.candidate.seasonId);
});

test('shows a bullpen exact year, included members, and excluded saves leader before drafting it', async ({ page, request }) => {
	const manifest = await currentManifest(request);
	const scenario = await cardScenario(request, manifest, candidate => candidate.eligibleSlots.includes('BP'));
	expect(scenario.profile.bullpen).toBeDefined();
	await openSavedDraft(page, scenario.draft);
	const card = await selectExactCard(page, scenario);
	await expect(card).toHaveAttribute('data-season-id', scenario.candidate.seasonId);
	await card.getByRole('button', { name: 'Details', exact: true }).click();
	for (const member of scenario.profile.bullpen!.members) await expect(card).toContainText(member.displayName);
	await expect(card).toContainText(scenario.profile.bullpen!.excluded.displayName);
	await expect(card).toContainText(/no composite WAR/i);
	const saved = await draftSelectedCard(page, scenario);
	expect(saved.picks.at(-1)).toMatchObject({ seasonId: scenario.candidate.seasonId, slot: 'BP' });
});
