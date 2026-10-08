import { expect, test, type Locator, type Page } from '@playwright/test';
import { legalSlots } from '../lib/game/draft.ts';
import type { Draft, Manifest, Profile, Slot } from '../lib/game/types.ts';
import { selectLogo, selectPhoto } from '../lib/media/client.ts';
import { rankGroups, type CandidateEntry, type RankingSort } from '../lib/components/candidate-ranking.ts';
import type { WarRankings } from '../lib/rankings/types.ts';
import {
	STORAGE_KEY,
	cardScenario,
	currentManifest,
	currentMedia,
	currentRankings,
	openSavedDraft,
	type CardScenario
} from './draft-test-fixtures.ts';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(180000);

function groupsFor(
	draft: Draft,
	manifest: Manifest,
	profiles: Profile[],
	sort: RankingSort,
	rankings: WarRankings | null,
	query = '',
	filter: Slot | 'All' = 'All'
) {
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

function draftSheet(page: Page): Locator {
	return page.locator('dialog.draft-sheet[open]');
}

async function selectNarrowCard(page: Page, scenario: CardScenario) {
	await page.getByRole('searchbox', { name: 'Find your pick' }).fill(scenario.profile.displayName);
	const group = page.locator(`[data-candidate-group="${scenario.candidate.playerId}"]`);
	await expect(group).toBeVisible();
	await group.getByRole('button', { name: /^Select / }).click();
	const sheet = draftSheet(page);
	await expect(sheet).toBeVisible();
	const selector = sheet.getByRole('combobox', { name: `Exact season for ${scenario.profile.displayName}`, exact: true });
	await selector.selectOption(scenario.candidate.seasonId);
	const card = group.locator(`.player-card[data-season-id="${scenario.candidate.seasonId}"]`);
	await expect(card).toBeVisible();
	const era = await card.locator('[data-card][data-face="front"]').first().getAttribute('data-card');
	expect(era).toMatch(/^(1950s|1960s|1970s|1980s|1990s|2000s|2010s|2020s)$/);
	return { card, selector, sheet, era: era! };
}

async function selectWideCard(page: Page, scenario: CardScenario) {
	await page.getByRole('searchbox', { name: 'Find your pick' }).fill(scenario.profile.displayName);
	const group = page.locator(`[data-candidate-group="${scenario.candidate.playerId}"]`);
	const selector = group.getByRole('combobox', { name: `Exact season for ${scenario.profile.displayName}`, exact: true });
	await expect(selector).toBeVisible();
	await selector.selectOption(scenario.candidate.seasonId);
	const card = group.locator(`.player-card[data-season-id="${scenario.candidate.seasonId}"]`);
	await expect(card).toBeVisible();
	const era = await card.locator('[data-card][data-face="front"]').first().getAttribute('data-card');
	expect(era).toMatch(/^(1950s|1960s|1970s|1980s|1990s|2000s|2010s|2020s)$/);
	return { card, era: era! };
}

async function openNarrowBack(sheet: Locator, era: string): Promise<void> {
	await sheet.getByRole('tab', { name: 'Card back', exact: true }).click();
	const back = sheet.locator('.designed-back [data-card][data-face="back"]').first();
	await expect(back).toBeVisible();
	await expect(back).toHaveAttribute('data-card', era);
	await expect(sheet.locator('.inspection-back')).toHaveCount(0);
}

async function openWideBack(card: Locator, era: string): Promise<void> {
	await card.getByRole('button', { name: 'Turn over', exact: true }).click();
	await expect(card.locator('[data-cardbox]')).toHaveAttribute('data-face', 'back');
	const back = card.locator('.back [data-card][data-face="back"]').first();
	await expect(back).toBeVisible();
	await expect(back).toHaveAttribute('data-card', era);
	await expect(card.locator('.inspection-back')).toHaveCount(0);
}

async function openTextVersion(root: Locator): Promise<Locator> {
	await root.locator('.disclosure-controls').getByRole('button', { name: 'Text version', exact: true }).click();
	const text = root.locator('.inspection-back');
	await expect(text).toBeVisible();
	await expect(text).toHaveAccessibleName('Historical season text version');
	return text;
}

async function openDetails(root: Locator): Promise<Locator> {
	await root.locator('.disclosure-controls').getByRole('button', { name: 'Details', exact: true }).click();
	const details = root.locator('.details');
	await expect(details).toBeVisible();
	await expect(details).toBeFocused();
	return details;
}

async function confirmNarrowPick(page: Page, scenario: CardScenario): Promise<Draft> {
	const sheet = draftSheet(page);
	await sheet.getByRole('tab', { name: 'Field', exact: true }).click();
	await sheet.locator(`[data-slot="${scenario.slot}"]`).click();
	await sheet.getByRole('button', { name: `Draft at ${scenario.slot}`, exact: true }).click();
	await expect(sheet).toHaveCount(0);
	return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY) as Promise<Draft>;
}

test('keeps a changed exact season in the narrow designed-back sheet through ranking arrival, then drafts that season', async ({ page, request }) => {
	const [manifest, media] = await Promise.all([currentManifest(request), currentMedia(request)]);
	const scenario = await cardScenario(request, manifest, (candidate, profile) =>
		!candidate.eligibleSlots.includes('BP') && !!media.players[candidate.playerId]?.photos.length && profile.playerId === candidate.playerId
	);
	const changedProfile = scenario.profiles.find(profile => profile.playerId === scenario.profile.playerId
		&& profile.seasonId !== scenario.profile.seasonId
		&& manifest.candidates.some(candidate => candidate.seasonId === profile.seasonId && legalSlots(scenario.draft, candidate, manifest).length > 0));
	expect(changedProfile).toBeDefined();
	const changedCandidate = manifest.candidates.find(candidate => candidate.seasonId === changedProfile!.seasonId)!;
	const slot = legalSlots(scenario.draft, changedCandidate, manifest)[0];
	const changedScenario: CardScenario = { ...scenario, candidate: changedCandidate, profile: changedProfile!, slot };
	const photo = selectPhoto(media, changedProfile!.playerId, changedProfile!.year, changedProfile!.franchiseId);
	expect(photo).not.toBeNull();
	const gate = Promise.withResolvers<void>();
	await page.route('**/rankings/*/manifest.json', async route => {
		await gate.promise;
		await route.continue();
	});
	try {
		await openSavedDraft(page, scenario.draft);
		const { card, selector, sheet, era } = await selectNarrowCard(page, changedScenario);
		await sheet.locator(`[data-slot="${slot}"]`).click();
		await openNarrowBack(sheet, era);
		await openTextVersion(sheet);
		gate.resolve();
		await expect(page.getByText('Loading composite WAR/162')).toHaveCount(0);
		await expect(selector).toHaveValue(changedProfile!.seasonId);
		await expect(sheet.locator('.inspection-back')).toBeVisible();
		await expect(card).toHaveAttribute('data-season-id', changedProfile!.seasonId);

		const details = await openDetails(sheet);
		await expect(details.getByRole('heading', { name: 'Statistics source', exact: true })).toBeVisible();
		await expect(details.getByText('Credit', { exact: true }).first()).toBeVisible();
		await expect(details.getByText('Licence', { exact: true }).first()).toBeVisible();
		const hrefs = await details.getByRole('link').evaluateAll(links => links.map(link => (link as HTMLAnchorElement).href));
		expect(hrefs).toEqual(expect.arrayContaining([photo!.sourceUrl, photo!.licenseUrl, manifest.attribution.sourceUrl]));
		const scrolls = await sheet.locator('.sheet-content').evaluate(content => {
			content.scrollTop = content.scrollHeight;
			const bottom = content.lastElementChild?.getBoundingClientRect().bottom ?? Infinity;
			return {
				scrollable: content.scrollHeight > content.clientHeight,
				bottomInside: bottom <= content.getBoundingClientRect().bottom + 1
			};
		});
		expect(scrolls).toEqual({ scrollable: true, bottomInside: true });
		await sheet.getByRole('tab', { name: 'Field', exact: true }).click();
		await expect(sheet.locator('[role="tabpanel"][aria-labelledby$="-tab-field"]')).toBeVisible();
		await expect(sheet.locator('[role="tabpanel"][aria-labelledby$="-tab-back"]')).toBeHidden();
		await sheet.getByRole('tab', { name: 'Card back', exact: true }).click();
		await expect(sheet.locator('.inspection-back')).toBeVisible();
		await expect(details).toBeVisible();
		await expect(sheet.getByRole('button', { name: `Draft at ${slot}`, exact: true })).toBeVisible();

		const saved = await confirmNarrowPick(page, changedScenario);
		expect(saved.picks.at(-1)?.seasonId).toBe(changedProfile!.seasonId);
		expect(saved.actions?.at(-1)).toEqual({ type: 'pick', seasonId: changedProfile!.seasonId, slot });
	} finally {
		gate.resolve();
	}
});

test('keeps a no-photo card draftable through the wide in-place flip when rankings fail and reduced motion is clean', async ({ page, request }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	const [manifest, media] = await Promise.all([currentManifest(request), currentMedia(request)]);
	const scenario = await cardScenario(request, manifest, candidate =>
		!candidate.eligibleSlots.includes('BP') && !media.players[candidate.playerId]?.photos.length
	);
	await page.route('**/rankings/current.json', route => route.abort());
	await openSavedDraft(page, scenario.draft);
	const { card, era } = await selectWideCard(page, scenario);
	await expect(card.getByText('No verified photo', { exact: true })).toBeVisible();
	await expect(page.getByText('Composite WAR/162 is unavailable.')).toBeVisible();
	await expect(card).toContainText(/WAR\/162.*Unavailable/i);
	await expect(card.getByRole('button', { name: 'Inspect card', exact: true })).toHaveCount(0);
	await expect(card.getByRole('button', { name: `Select ${scenario.profile.year} ${scenario.profile.displayName}`, exact: true })).toBeVisible();
	await openWideBack(card, era);
	await expect(card.locator('[data-flip]')).toHaveCSS('transform', 'none');
	await expect(card.locator('.back')).toHaveCSS('transform', 'none');
	await openTextVersion(card);
	await card.getByRole('button', { name: 'Turn over', exact: true }).click();
	await card.getByRole('button', { name: `Select ${scenario.profile.year} ${scenario.profile.displayName}`, exact: true }).click();
	const field = page.locator('.field-panel');
	await field.locator(`[data-slot="${scenario.slot}"]`).click();
	await field.getByRole('button', { name: `Draft at ${scenario.slot}`, exact: true }).click();
	const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY) as Draft;
	expect(saved.picks.at(-1)?.seasonId).toBe(scenario.candidate.seasonId);
});

test('keeps an inspectable card draftable when the optional media index fails', async ({ page, request }) => {
	const manifest = await currentManifest(request);
	const scenario = await cardScenario(request, manifest, candidate => !candidate.eligibleSlots.includes('BP'));
	await page.route('**/media/current.json', route => route.abort());
	await openSavedDraft(page, scenario.draft);
	const { card, sheet, era } = await selectNarrowCard(page, scenario);
	await expect(card.getByRole('img', { name: 'Photo source unavailable', exact: true })).toBeVisible();
	await openNarrowBack(sheet, era);
	const details = await openDetails(sheet);
	const photo = details.getByRole('heading', { name: 'Photo', exact: true }).locator('..');
	await expect(photo).toContainText(/source is unavailable/i);
	const saved = await confirmNarrowPick(page, scenario);
	expect(saved.picks.at(-1)?.seasonId).toBe(scenario.candidate.seasonId);
});

test('an image load failure preserves the chosen exact season and draft action', async ({ page, request }) => {
	const [manifest, media] = await Promise.all([currentManifest(request), currentMedia(request)]);
	const scenario = await cardScenario(request, manifest, candidate =>
		!candidate.eligibleSlots.includes('BP') && !!media.players[candidate.playerId]?.photos.length
	);
	const photo = selectPhoto(media, scenario.candidate.playerId, scenario.profile.year, scenario.profile.franchiseId);
	expect(photo).not.toBeNull();
	const logo = selectLogo(media, scenario.profile.franchiseId, scenario.profile.year);
	expect(logo).not.toBeNull();
	await page.route(`**${logo!.asset.url}`, route => route.abort());
	await page.route(`**${photo!.url}`, route => route.abort());
	await openSavedDraft(page, scenario.draft);
	const { card } = await selectNarrowCard(page, scenario);
	await expect(card.getByText('Photo unavailable', { exact: true })).toBeVisible();
	await expect(card.getByRole('img', { name: /^Team mark image unavailable:/ })).toBeVisible();
	const saved = await confirmNarrowPick(page, scenario);
	expect(saved.picks.at(-1)?.seasonId).toBe(scenario.candidate.seasonId);
	expect(saved.actions?.at(-1)).toEqual({ type: 'pick', seasonId: scenario.candidate.seasonId, slot: scenario.slot });
});

test('shows a bullpen designed back, readable members and excluded saves leader, and no composite WAR before drafting', async ({ page, request }) => {
	const manifest = await currentManifest(request);
	const scenario = await cardScenario(request, manifest, candidate => candidate.eligibleSlots.includes('BP'));
	expect(scenario.profile.bullpen).toBeDefined();
	await openSavedDraft(page, scenario.draft);
	const { card, sheet, era } = await selectNarrowCard(page, scenario);
	await expect(card).toHaveAttribute('data-season-id', scenario.candidate.seasonId);
	await openNarrowBack(sheet, era);
	const text = await openTextVersion(sheet);
	await expect(text).toContainText(/excludes saves leader/i);
	await expect(text).toContainText(/no composite WAR/i);
	const details = await openDetails(sheet);
	for (const member of scenario.profile.bullpen!.members) await expect(details).toContainText(member.displayName);
	await expect(details).toContainText(scenario.profile.bullpen!.excluded.displayName);
	const saved = await confirmNarrowPick(page, scenario);
	expect(saved.picks.at(-1)).toMatchObject({ seasonId: scenario.candidate.seasonId, slot: 'BP' });
});

test('keeps the two-way finish and both readable stat families through ordinary roster inspection and sheet transfer', async ({ page, request }) => {
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
	const hitterSlot = legalSlots(scenario.draft, scenario.candidate, manifest)
		.find(slot => !slot.startsWith('SP') && slot !== 'CL' && slot !== 'BP');
	expect(hitterSlot).toBeDefined();
	const hitterScenario: CardScenario = { ...scenario, slot: hitterSlot! };
	const ranking = rankings.seasons[scenario.candidate.seasonId];
	await openSavedDraft(page, scenario.draft);
	const { card } = await selectNarrowCard(page, hitterScenario);
	await expect(page.getByText('Loading composite WAR/162')).toHaveCount(0);
	await expect(card.locator('[data-layer="stat.primary.label"]')).toContainText('BAT WAR/162');
	await expect(card.locator('[data-layer="stat.primary.value"]')).toHaveText(ranking.battingWAR162!.toFixed(2));
	const expectedFinish = ranking.pitchingWAR162! >= 6 ? 'gem' : ranking.pitchingWAR162! >= 4 ? 'emboss' : ranking.pitchingWAR162! >= 2 ? 'foil' : 'base';
	await expect(card.locator('[data-card][data-face="front"]').first()).toHaveAttribute('data-finish', expectedFinish);
	const saved = await confirmNarrowPick(page, hitterScenario);
	expect(saved.picks.at(-1)?.seasonId).toBe(scenario.candidate.seasonId);

	await page.setViewportSize({ width: 1280, height: 900 });
	const field = page.locator('.field-panel');
	const roster = field.locator(`.roster-item[data-season-id="${scenario.candidate.seasonId}"]`);
	await expect(roster).toHaveAttribute('data-card-finish', expectedFinish);
	const era = await roster.getAttribute('data-card-era');
	expect(era).not.toBeNull();
	await field.locator(`[data-slot="${hitterSlot}"]`).click();
	await field.getByRole('button', { name: 'Inspect card', exact: true }).click();
	const dialog = page.locator('dialog.card-inspection[open]');
	await expect(dialog).toBeVisible();
	const turn = dialog.getByRole('button', { name: 'Turn over', exact: true });
	await expect(turn).toBeFocused();
	await turn.click();
	await expect(dialog.locator('[data-cardbox]')).toHaveAttribute('data-face', 'back');
	const designedBack = dialog.locator('.back [data-card][data-face="back"]').first();
	await expect(designedBack).toBeVisible();
	await expect(designedBack).toHaveAttribute('data-card', era!);
	await expect(dialog.locator('.inspection-back')).toHaveCount(0);
	let text = await openTextVersion(dialog);
	await expect(text.getByRole('heading', { name: 'Batting', exact: true })).toBeVisible();
	await expect(text.getByRole('heading', { name: 'Pitching', exact: true })).toBeVisible();

	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.locator('dialog.card-inspection[open]')).toHaveCount(0);
	const sheet = draftSheet(page);
	await expect(sheet).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Back to field', exact: true })).toBeVisible();
	await expect(sheet.locator('.active-player')).toContainText(scenario.profile.displayName);
	await expect(sheet.locator('.active-player')).toContainText(String(scenario.profile.year));
	const transferredBack = sheet.locator('.designed-back [data-card][data-face="back"]').first();
	await expect(transferredBack).toBeVisible();
	await expect(transferredBack).toHaveAttribute('data-card', era!);
	text = await openTextVersion(sheet);
	await expect(text.locator('[data-layer="name.full"]')).toContainText(scenario.profile.displayName);
	await expect(text.locator('[data-layer="season.line"]')).toContainText(String(scenario.profile.year));
	await expect(text.getByRole('heading', { name: 'Batting', exact: true })).toBeVisible();
	await expect(text.getByRole('heading', { name: 'Pitching', exact: true })).toBeVisible();
	await sheet.getByRole('button', { name: 'Back to field', exact: true }).click();
	await expect(sheet.locator('.active-player')).toContainText(scenario.profile.displayName);
	await expect(sheet.getByText('Choose a highlighted position to move or swap.')).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Cancel move', exact: true })).toBeVisible();
	await sheet.getByRole('button', { name: 'Cancel move', exact: true }).click();
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
		await art.scrollIntoViewIfNeeded();
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
