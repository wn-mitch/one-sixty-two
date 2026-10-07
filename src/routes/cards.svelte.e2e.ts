import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { availableCandidates, createDraft, legalSlots, rollDraft } from '../lib/game/draft.ts';
import type { Candidate, Draft, Manifest, Profile, Slot } from '../lib/game/types.ts';
import { selectLogo, selectPhoto } from '../lib/media/client.ts';
import type { MediaManifest, MediaPointer } from '../lib/media/types.ts';
import { rankGroups, type CandidateEntry, type RankingSort } from '../lib/components/candidate-ranking.ts';
import type { WarRankings, WarRankingsPointer } from '../lib/rankings/types.ts';

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

async function currentRankings(request: APIRequestContext): Promise<WarRankings> {
	const pointerResponse = await request.get('/rankings/current.json');
	expect(pointerResponse.ok()).toBe(true);
	const pointer = await pointerResponse.json() as WarRankingsPointer;
	const manifestResponse = await request.get(pointer.manifestUrl);
	expect(manifestResponse.ok()).toBe(true);
	return manifestResponse.json() as Promise<WarRankings>;
}

async function cardScenario(
	request: APIRequestContext,
	manifest: Manifest,
	accept: (candidate: Candidate, profile: Profile) => boolean
): Promise<CardScenario> {
	const profilesByChunk = new Map<string, Profile[]>();
	for (let seed = 1; seed <= 500; seed++) {
		const draft = rollDraft(createDraft(manifest, seed), manifest);
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
	return { card, group, selector };
}

async function draftSelectedCard(page: Page, scenario: CardScenario): Promise<Draft> {
	const { card } = await selectExactCard(page, scenario);
	await card.getByRole('button', { name: `Choose ${scenario.profile.year}`, exact: true }).click();
	await expect(card.getByRole('button', { name: 'Clear selection', exact: true })).toBeVisible();
	await page.locator(`.assignment-dock input[value="${scenario.slot}"]`).check();
	await page.getByRole('button', { name: `Draft player at ${scenario.slot}`, exact: true }).click();
	return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY) as Promise<Draft>;
}

function groupsFor(draft: Draft, manifest: Manifest, profiles: Profile[], sort: RankingSort, rankings: WarRankings | null, query = '', filter: Slot | 'All' = 'All') {
	const roll = draft.currentRoll!;
	const candidates = new Set(manifest.candidates
		.filter(candidate => candidate.franchiseId === roll.franchiseId && candidate.decade === roll.decade)
		.map(candidate => candidate.seasonId));
	const needle = query.trim().toLowerCase();
	const entries: CandidateEntry[] = profiles
		.filter(profile => candidates.has(profile.seasonId))
		.filter(profile => filter === 'All' || profile.eligibleSlots.includes(filter))
		.filter(profile => !needle || `${profile.displayName} ${profile.year} ${profile.historicalTeam}`.toLowerCase().includes(needle))
		.map(profile => ({ profile, slots: filter === 'All' ? profile.eligibleSlots : [filter] }));
	return rankGroups(entries, sort, rankings).slice(0, 20).map(group => group.playerId);
}

async function visibleGroupIds(page: Page): Promise<string[]> {
	return page.locator('[data-candidate-group]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-candidate-group')!));
}

async function openInspection(page: Page, trigger: Locator) {
	await trigger.click();
	const dialog = page.locator('dialog.card-inspection[open]');
	const turn = dialog.getByRole('button', { name: 'Turn over', exact: true });
	await expect(dialog).toBeVisible();
	await expect(turn).toBeFocused();
	return { dialog, turn };
}

test('keeps a changed exact season while inspecting through ranking arrival, then drafts that season', async ({ page, request }) => {
	const [manifest, media] = await Promise.all([currentManifest(request), currentMedia(request)]);
	const scenario = await cardScenario(request, manifest, (candidate, profile) =>
		!candidate.eligibleSlots.includes('BP') && !!media.players[candidate.playerId]?.photos.length && profile.playerId === candidate.playerId
	);
	const changedProfile = scenario.profiles.find(profile => profile.playerId === scenario.profile.playerId
		&& profile.seasonId !== scenario.profile.seasonId
		&& manifest.candidates.some(candidate => candidate.seasonId === profile.seasonId && legalSlots(scenario.draft, candidate, manifest).length > 0));
	expect(changedProfile).toBeDefined();
	const changedCandidate = manifest.candidates.find(candidate => candidate.seasonId === changedProfile!.seasonId)!;
	const photo = selectPhoto(media, changedProfile!.playerId, changedProfile!.year);
	expect(photo).not.toBeNull();
	const gate = Promise.withResolvers<void>();
	await page.route('**/rankings/*/manifest.json', async route => { await gate.promise; await route.continue(); });
	try {
		await openSavedDraft(page, scenario.draft);
		const { group, selector } = await selectExactCard(page, scenario);
		await selector.selectOption(changedProfile!.seasonId);
		const changedCard = group.locator(`.player-card[data-season-id="${changedProfile!.seasonId}"]`);
		const art = changedCard.getByRole('button', { name: `Inspect ${changedProfile!.year} ${changedProfile!.displayName} card`, exact: true });
		const first = await openInspection(page, art);
		await expect(first.dialog.getByRole('button', { name: /^Choose |Draft player at / })).toHaveCount(0);
		await expect(first.dialog.locator('[data-choose-season], .assignment-dock')).toHaveCount(0);
		await first.dialog.getByRole('button', { name: 'Close card', exact: true }).click();
		await expect(art).toBeFocused();

		const inspect = changedCard.getByRole('button', { name: 'Inspect card', exact: true });
		const { dialog, turn } = await openInspection(page, inspect);
		await turn.click();
		await expect(dialog.locator('[data-cardbox]')).toHaveAttribute('data-face', 'back');
		await expect(dialog.locator('.inspection-back')).toBeVisible();
		gate.resolve();
		await expect(page.getByText('Loading composite WAR/162')).toHaveCount(0);
		await expect(selector).toHaveValue(changedProfile!.seasonId);
		await expect(changedCard).toHaveAttribute('data-season-id', changedProfile!.seasonId);

		await dialog.getByRole('button', { name: /^Details/ }).click();
		const details = dialog.locator('.details');
		await expect(details).toBeFocused();
		await expect(details.getByRole('heading', { name: 'Statistics source', exact: true })).toBeVisible();
		await expect(details.getByText('Credit', { exact: true }).first()).toBeVisible();
		await expect(details.getByText('Licence', { exact: true }).first()).toBeVisible();
		const hrefs = await details.getByRole('link').evaluateAll(links => links.map(link => (link as HTMLAnchorElement).href));
		expect(hrefs).toEqual(expect.arrayContaining([photo!.sourceUrl, photo!.licenseUrl, manifest.attribution.sourceUrl]));
		const scrolls = await dialog.locator('.inspection-content').evaluate(content => {
			content.scrollTop = content.scrollHeight;
			const bottom = content.lastElementChild?.getBoundingClientRect().bottom ?? Infinity;
			return { scrollable: content.scrollHeight > content.clientHeight, bottomInside: bottom <= content.getBoundingClientRect().bottom + 1 };
		});
		expect(scrolls).toEqual({ scrollable: true, bottomInside: true });
		await page.keyboard.press('Escape');
		await expect(inspect).toBeFocused();

		await changedCard.getByRole('button', { name: `Choose ${changedProfile!.year}`, exact: true }).click();
		const slot = legalSlots(scenario.draft, changedCandidate, manifest)[0];
		await page.locator(`.assignment-dock input[value="${slot}"]`).check();
		await page.getByRole('button', { name: `Draft player at ${slot}`, exact: true }).click();
		const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY) as Draft;
		expect(saved.picks.at(-1)?.seasonId).toBe(changedProfile!.seasonId);
		expect(saved.actions?.at(-1)).toEqual({ type: 'pick', seasonId: changedProfile!.seasonId, slot });
	} finally {
		gate.resolve();
	}
});

test('keeps a no-photo card draftable when ranking enrichment is unavailable and reduced motion is clean', async ({ page, request }) => {
	const [manifest, media] = await Promise.all([currentManifest(request), currentMedia(request)]);
	const scenario = await cardScenario(request, manifest, candidate =>
		!candidate.eligibleSlots.includes('BP') && !media.players[candidate.playerId]?.photos.length
	);
	await page.route('**/rankings/current.json', route => route.abort());
	await openSavedDraft(page, scenario.draft);
	const { card } = await selectExactCard(page, scenario);
	await expect(card.getByText('No verified photo', { exact: true })).toBeVisible();
	await expect(page.getByText('Composite WAR/162 is unavailable.')).toBeVisible();
	await expect(card).toContainText(/WAR\/162.*Unavailable/i);
	const { dialog, turn } = await openInspection(page, card.getByRole('button', { name: 'Inspect card', exact: true }));
	await turn.click();
	await expect(dialog.locator('[data-flip]')).toHaveCSS('transform', 'none');
	await expect(dialog.locator('[data-card][data-face="back"]')).toHaveCSS('transform', 'none');
	await page.keyboard.press('Escape');
	const saved = await draftSelectedCard(page, scenario);
	expect(saved.picks.at(-1)?.seasonId).toBe(scenario.candidate.seasonId);
});

test('keeps an inspectable card draftable when the optional media index fails', async ({ page, request }) => {
	const manifest = await currentManifest(request);
	const scenario = await cardScenario(request, manifest, candidate => !candidate.eligibleSlots.includes('BP'));
	await page.route('**/media/current.json', route => route.abort());
	await openSavedDraft(page, scenario.draft);
	const { card } = await selectExactCard(page, scenario);
	await expect(card.getByRole('img', { name: 'Photo source unavailable', exact: true })).toBeVisible();
	const { dialog, turn } = await openInspection(page, card.getByRole('button', { name: 'Inspect card', exact: true }));
	await turn.click();
	await dialog.getByRole('button', { name: /^Details/ }).click();
	const photo = dialog.getByRole('heading', { name: 'Photo', exact: true }).locator('..');
	await expect(photo).toContainText(/source is unavailable/i);
	await page.keyboard.press('Escape');
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
	const logo = selectLogo(media, scenario.profile.franchiseId, scenario.profile.year);
	expect(logo).not.toBeNull();
	await page.route(`**${logo!.asset.url}`, route => route.abort());
	await page.route(`**${photo!.url}`, route => route.abort());
	await openSavedDraft(page, scenario.draft);
	const { card } = await selectExactCard(page, scenario);
	await expect(card.getByText('Photo unavailable', { exact: true })).toBeVisible();
	await expect(card.getByRole('img', { name: /^Team mark image unavailable:/ })).toBeVisible();
	const saved = await draftSelectedCard(page, scenario);
	expect(saved.picks.at(-1)?.seasonId).toBe(scenario.candidate.seasonId);
});

test('shows a bullpen exact year, members, excluded saves leader, and no WAR in inspection before drafting', async ({ page, request }) => {
	const manifest = await currentManifest(request);
	const scenario = await cardScenario(request, manifest, candidate => candidate.eligibleSlots.includes('BP'));
	expect(scenario.profile.bullpen).toBeDefined();
	await openSavedDraft(page, scenario.draft);
	const { card } = await selectExactCard(page, scenario);
	await expect(card).toHaveAttribute('data-season-id', scenario.candidate.seasonId);
	const { dialog, turn } = await openInspection(page, card.getByRole('button', { name: 'Inspect card', exact: true }));
	await turn.click();
	await dialog.getByRole('button', { name: /^Details/ }).click();
	for (const member of scenario.profile.bullpen!.members) await expect(dialog).toContainText(member.displayName);
	await expect(dialog).toContainText(scenario.profile.bullpen!.excluded.displayName);
	await expect(dialog).toContainText(/no composite WAR/i);
	await page.keyboard.press('Escape');
	const saved = await draftSelectedCard(page, scenario);
	expect(saved.picks.at(-1)).toMatchObject({ seasonId: scenario.candidate.seasonId, slot: 'BP' });
});

test('renders a two-way batting front with the higher pitching finish from current rankings', async ({ page, request }) => {
	const [manifest, rankings] = await Promise.all([currentManifest(request), currentRankings(request)]);
	const scenario = await cardScenario(request, manifest, (candidate, profile) => {
		const ranking = rankings.seasons[candidate.seasonId];
		if (typeof ranking?.battingWAR162 !== 'number' || typeof ranking.pitchingWAR162 !== 'number') return false;
		const battingTier = ranking.battingWAR162 >= 6 ? 'gem' : ranking.battingWAR162 >= 4 ? 'emboss' : ranking.battingWAR162 >= 2 ? 'foil' : 'base';
		const pitchingTier = ranking.pitchingWAR162 >= 6 ? 'gem' : ranking.pitchingWAR162 >= 4 ? 'emboss' : ranking.pitchingWAR162 >= 2 ? 'foil' : 'base';
		return !candidate.eligibleSlots.includes('BP') && !!profile.batting && !!profile.pitching
			&& candidate.eligibleSlots.some(slot => !slot.startsWith('SP') && slot !== 'CL' && slot !== 'BP')
			&& ranking.pitchingWAR162 > ranking.battingWAR162 && pitchingTier !== battingTier;
	});
	const ranking = rankings.seasons[scenario.candidate.seasonId];
	await openSavedDraft(page, scenario.draft);
	const { card } = await selectExactCard(page, scenario);
	await expect(page.getByText('Loading composite WAR/162')).toHaveCount(0);
	await expect(card.locator('[data-layer="stat.primary.label"]')).toContainText('BAT WAR/162');
	await expect(card.locator('[data-layer="stat.primary.value"]')).toHaveText(ranking.battingWAR162!.toFixed(2));
	const expectedFinish = ranking.pitchingWAR162! >= 6 ? 'gem' : ranking.pitchingWAR162! >= 4 ? 'emboss' : ranking.pitchingWAR162! >= 2 ? 'foil' : 'base';
	await expect(card.locator('[data-card][data-face="front"]')).toHaveAttribute('data-finish', expectedFinish);
	const saved = await draftSelectedCard(page, scenario);
	expect(saved.picks.at(-1)?.seasonId).toBe(scenario.candidate.seasonId);
	await page.setViewportSize({ width: 1280, height: 900 });
	const roster = page.locator('.roster-item');
	await expect(roster).toHaveAttribute('data-card-finish', expectedFinish);
	await openInspection(page, roster.getByRole('button', { name: 'Inspect card', exact: true }));
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.locator('dialog[open]')).toHaveCount(0);
	await expect(page.locator('.roster summary')).toBeFocused();
});

test('filters, searches, and sorts the visible runtime pool by the same ranked groups', async ({ page, request }) => {
	const [manifest, rankings] = await Promise.all([currentManifest(request), currentRankings(request)]);
	const scenario = await cardScenario(request, manifest, () => true);
	await openSavedDraft(page, scenario.draft);
	await expect(page.getByText('Loading composite WAR/162')).toHaveCount(0);
	expect(await visibleGroupIds(page)).toEqual(groupsFor(scenario.draft, manifest, scenario.profiles, 'war', rankings));
	const filter = scenario.profile.eligibleSlots[0];
	await page.locator('.filters').getByRole('button', { name: filter, exact: true }).click();
	expect(await visibleGroupIds(page)).toEqual(groupsFor(scenario.draft, manifest, scenario.profiles, 'war', rankings, '', filter));
	await page.getByRole('searchbox', { name: 'Find your pick' }).fill(scenario.profile.displayName);
	expect(await visibleGroupIds(page)).toEqual(groupsFor(scenario.draft, manifest, scenario.profiles, 'war', rankings, scenario.profile.displayName, filter));
	await page.getByRole('searchbox', { name: 'Find your pick' }).fill('');
	await page.locator('.ranking-controls select').selectOption('metrics');
	expect(await visibleGroupIds(page)).toEqual(groupsFor(scenario.draft, manifest, scenario.profiles, 'metrics', rankings, '', filter));
});

test.describe('normal card motion', () => {
	test.use({ reducedMotion: 'no-preference' });

	test('tilts only for mouse and returns the reordered grid to clean styles', async ({ page, request }) => {
		const [manifest, rankings] = await Promise.all([currentManifest(request), currentRankings(request)]);
		const scenario = await cardScenario(request, manifest, () => true);
		await openSavedDraft(page, scenario.draft);
		await expect(page.getByText('Loading composite WAR/162')).toHaveCount(0);
		expect(groupsFor(scenario.draft, manifest, scenario.profiles, 'war', rankings)).not.toEqual(groupsFor(scenario.draft, manifest, scenario.profiles, 'metrics', rankings));
		const art = page.locator('.art-trigger').first();
		const surface = art.locator('[data-card][data-face="front"]');
		await art.dispatchEvent('pointermove', { pointerType: 'touch', clientX: 1, clientY: 1 });
		expect(await surface.evaluate(node => (node as HTMLElement).style.transform)).toBe('');
		const bounds = await art.boundingBox();
		expect(bounds).not.toBeNull();
		await art.dispatchEvent('pointermove', { pointerType: 'mouse', clientX: bounds!.x + bounds!.width, clientY: bounds!.y });
		await expect.poll(() => surface.evaluate(node => (node as HTMLElement).style.transform)).toMatch(/rotateX\((-?[\d.]+)deg\).*rotateY\((-?[\d.]+)deg\)/);
		const tilt = await surface.evaluate(node => (node as HTMLElement).style.transform.match(/rotateX\((-?[\d.]+)deg\).*rotateY\((-?[\d.]+)deg\)/)?.slice(1).map(Number));
		expect(tilt).toBeDefined();
		for (const angle of tilt!) expect(Math.abs(angle)).toBeLessThanOrEqual(9);
		await art.dispatchEvent('pointerleave', { pointerType: 'mouse' });
		await expect.poll(() => surface.evaluate(node => (node as HTMLElement).style.transform)).toBe('');

		await page.evaluate(() => {
			const root = document.querySelector('.candidates')!;
			(window as Window & { cardGridMoved?: boolean }).cardGridMoved = false;
			const observer = new MutationObserver(records => {
				if (records.some(record => record.target instanceof HTMLElement && record.target.matches('[data-candidate-group]') && record.target.style.transform)) {
					observer.disconnect();
					(window as Window & { cardGridMoved?: boolean }).cardGridMoved = true;
				}
			});
			observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['style'] });
		});
		await page.locator('.ranking-controls select').selectOption('metrics');
		await expect.poll(() => page.evaluate(() => (window as Window & { cardGridMoved?: boolean }).cardGridMoved)).toBe(true);
		await expect.poll(() => page.locator('[data-candidate-group]').evaluateAll(nodes => nodes.every(node => {
			const style = (node as HTMLElement).style;
			return !style.transform && !style.opacity;
		}))).toBe(true);
		expect(await page.locator('body > [aria-hidden="true"][inert]').count()).toBe(0);
		expect(await visibleGroupIds(page)).toEqual(groupsFor(scenario.draft, manifest, scenario.profiles, 'metrics', rankings));
	});
});
