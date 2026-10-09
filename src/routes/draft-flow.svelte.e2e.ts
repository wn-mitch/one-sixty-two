import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { availableCandidates, commitPick, createDraft, legalSlots, rollDraft } from '../lib/game/draft.ts';
import { HITTER_SLOTS, type Draft, type HitterSlot, type Manifest, type Profile, type Slot } from '../lib/game/types.ts';
import { STORAGE_KEY, cardScenario, currentManifest, openSavedDraft, type CardScenario } from './draft-test-fixtures.ts';

test.setTimeout(180000);

type RetentionScenario = {
	draft: Draft;
	primary: Profile;
	legalAlternative: Profile;
	illegalAlternative: Profile;
	slot: Slot;
};

type BlockedScenario = {
	draft: Draft;
	profile: Profile;
};

function savedDraft(page: Page): Promise<Draft> {
	return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY) as Promise<Draft>;
}

function persistedState(draft: Draft) {
	return { actions: draft.actions, currentRoll: draft.currentRoll, picks: draft.picks };
}

async function expectNoPersistenceChange(page: Page, before: Draft): Promise<void> {
	expect(persistedState(await savedDraft(page))).toEqual(persistedState(before));
}

async function findPitcherScenario(request: APIRequestContext, manifest: Manifest): Promise<CardScenario> {
	const chunks = new Map<string, Profile[]>();
	for (let seed = 1; seed <= 500; seed++) {
		const draft = rollDraft(createDraft(manifest, seed), manifest);
		const roll = draft.currentRoll;
		if (!roll) continue;
		const chunkUrl = manifest.chunks[`${roll.franchiseId}-${roll.decade}`];
		let profiles = chunks.get(chunkUrl);
		if (!profiles) {
			const response = await request.get(chunkUrl);
			expect(response.ok()).toBe(true);
			profiles = await response.json() as Profile[];
			chunks.set(chunkUrl, profiles);
		}
		for (const candidate of availableCandidates(draft, manifest)) {
			const slots = legalSlots(draft, candidate, manifest);
			const [slot] = slots;
			if (candidate.eligibleSlots.some(position => HITTER_SLOTS.includes(position as HitterSlot)) || slots.length !== 1 || !slot) continue;
			const profile = profiles.find(item => item.seasonId === candidate.seasonId);
			if (profile) return { draft, candidate, profile, profiles, slot };
		}
	}
	throw new Error('Current data did not produce a one-slot pitcher scenario in 500 deterministic rolls');
}

async function retentionScenario(request: APIRequestContext, manifest: Manifest): Promise<RetentionScenario> {
	const chunks = new Map<string, Profile[]>();
	const bySeason = new Map(manifest.candidates.map(candidate => [candidate.seasonId, candidate]));

	for (let seed = 1; seed <= 500; seed++) {
		const draft = rollDraft(createDraft(manifest, seed), manifest);
		const roll = draft.currentRoll;
		if (!roll) continue;
		const chunkUrl = manifest.chunks[`${roll.franchiseId}-${roll.decade}`];
		let profiles = chunks.get(chunkUrl);
		if (!profiles) {
			const response = await request.get(chunkUrl);
			expect(response.ok()).toBe(true);
			profiles = await response.json() as Profile[];
			chunks.set(chunkUrl, profiles);
		}

		for (const primaryCandidate of availableCandidates(draft, manifest)) {
			const primary = profiles.find(profile => profile.seasonId === primaryCandidate.seasonId);
			if (!primary) continue;
			const seasons = profiles.filter(profile => profile.playerId === primary.playerId);
			for (const slot of legalSlots(draft, primaryCandidate, manifest)) {
				const legalAlternative = seasons.find(profile => {
					const candidate = bySeason.get(profile.seasonId);
					return profile.seasonId !== primary.seasonId && candidate &&
						candidate.franchiseId === roll.franchiseId && candidate.decade === roll.decade &&
						legalSlots(draft, candidate, manifest).includes(slot);
				});
				const illegalAlternative = seasons.find(profile => {
					const candidate = bySeason.get(profile.seasonId);
					return profile.seasonId !== primary.seasonId && candidate &&
						candidate.franchiseId === roll.franchiseId && candidate.decade === roll.decade &&
						!legalSlots(draft, candidate, manifest).includes(slot);
				});
				if (legalAlternative && illegalAlternative) return { draft, primary, legalAlternative, illegalAlternative, slot };
			}
		}
	}

	throw new Error('Current data did not produce a multi-season legal/illegal destination-retention scenario in 500 deterministic rolls');
}

async function blockedScenario(request: APIRequestContext, manifest: Manifest): Promise<BlockedScenario> {
	const profilesByChunk = new Map<string, Profile[]>();
	const bySeason = new Map(manifest.candidates.map(candidate => [candidate.seasonId, candidate]));
	for (let seed = 1; seed <= 20; seed++) {
		let draft = createDraft(manifest, seed);
		for (let pick = 0; pick < 13; pick++) {
			draft = rollDraft(draft, manifest);
			const roll = draft.currentRoll!;
			const available = availableCandidates(draft, manifest);
			const availableIds = new Set(available.map(candidate => candidate.seasonId));
			const usedPlayers = new Set(draft.picks.map(item => bySeason.get(item.seasonId)!.playerId));
			const chunkUrl = manifest.chunks[`${roll.franchiseId}-${roll.decade}`];
			let profiles = profilesByChunk.get(chunkUrl);
			if (!profiles) {
				const response = await request.get(chunkUrl);
				expect(response.ok()).toBe(true);
				profiles = await response.json() as Profile[];
				profilesByChunk.set(chunkUrl, profiles);
			}
			const byPlayer = new Map<string, Profile[]>();
			for (const profile of profiles) {
				if (!bySeason.has(profile.seasonId) || usedPlayers.has(profile.playerId)) continue;
				const entries = byPlayer.get(profile.playerId) ?? [];
				entries.push(profile);
				byPlayer.set(profile.playerId, entries);
			}
			const blocked = [...byPlayer.values()].find(entries => entries.every(profile => !availableIds.has(profile.seasonId)));
			if (blocked) return { draft, profile: blocked[0] };
			const candidate = available[0];
			draft = commitPick(draft, manifest, candidate.seasonId, legalSlots(draft, candidate, manifest)[0]);
		}
	}
	throw new Error('Current data did not produce a fully blocked unused candidate group');
}

async function searchFor(page: Page, profile: Profile) {
	await page.getByRole('searchbox', { name: 'Find your pick' }).fill(profile.displayName);
	const group = page.locator(`[data-candidate-group="${profile.playerId}"]`);
	await expect(group).toBeVisible();
	return group;
}

async function selectNarrowCandidate(page: Page, profile: Profile): Promise<void> {
	const group = await searchFor(page, profile);
	await group.locator('button.art-trigger').click();
	const sheet = page.locator('dialog.draft-sheet[open]');
	await expect(sheet).toBeVisible();
	const selector = sheet.getByRole('combobox', { name: /^Exact season for / });
	await selector.selectOption(profile.seasonId);
	await expect(sheet.locator('.pick-confirmation')).toHaveAttribute('data-selected-season', profile.seasonId);
}

async function selectWideCandidate(page: Page, profile: Profile): Promise<void> {
	const group = await searchFor(page, profile);
	await group.getByRole('combobox', { name: `Exact season for ${profile.displayName}`, exact: true }).selectOption(profile.seasonId);
	const card = group.locator(`.player-card[data-season-id="${profile.seasonId}"]`);
	await expect(card).toBeVisible();
	await card.locator('button.select-front').click();
}

async function placeAt(page: Page, slot: Slot, root: Locator = page.locator('body')): Promise<void> {
	const target = root.locator(`[data-slot="${slot}"]`);
	await expect(target).toBeEnabled();
	await target.click();
}

test.describe('draft interaction boundaries', () => {
	test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });

	test('keeps desktop select, flip, preview, outside-flip dismissal, and cancellation local until explicit confirmation', async ({ page, request }) => {
		const manifest = await currentManifest(request);
		const scenario = await cardScenario(request, manifest, () => true);
		await openSavedDraft(page, scenario.draft);
		const before = await savedDraft(page);

		await selectWideCandidate(page, scenario.profile);
		await placeAt(page, scenario.slot, page.locator('.field-panel'));
		const confirmation = page.locator('.field-panel .pick-confirmation');
		await expect(confirmation).toHaveAttribute('data-selected-season', scenario.profile.seasonId);
		await expect(confirmation).toHaveAttribute('data-pending-slot', scenario.slot);
		await expectNoPersistenceChange(page, before);

		const group = page.locator(`[data-candidate-group="${scenario.profile.playerId}"]`);
		await group.getByRole('button', { name: 'Turn over', exact: true }).click();
		await expect(group.locator('.cardbox')).toHaveAttribute('data-face', 'back');
		await page.locator('.search-row').click();
		await expect(group.locator('.cardbox')).toHaveAttribute('data-face', 'front');
		await expect(confirmation).toHaveAttribute('data-pending-slot', scenario.slot);
		await expectNoPersistenceChange(page, before);

		await confirmation.getByRole('button', { name: 'Cancel selection', exact: true }).click();
		await expect(confirmation).toHaveCount(0);
		await expectNoPersistenceChange(page, before);

		await selectWideCandidate(page, scenario.profile);
		await placeAt(page, scenario.slot, page.locator('.field-panel'));
		await page.locator('.field-panel').getByRole('button', { name: `Draft at ${scenario.slot}`, exact: true }).click();
		const committed = await savedDraft(page);
		expect(committed.picks).toHaveLength(before.picks.length + 1);
		expect(committed.actions).toHaveLength((before.actions?.length ?? 0) + 1);
		expect(committed.actions?.at(-1)).toEqual({ type: 'pick', seasonId: scenario.profile.seasonId, slot: scenario.slot });
		await expect(page.getByRole('button', { name: 'Roll next franchise', exact: true })).toBeVisible();
	});

	test('hides fully blocked desktop groups until the explicit toggle without disabling qualification filters', async ({ page, request }) => {
		const manifest = await currentManifest(request);
		const scenario = await blockedScenario(request, manifest);
		await openSavedDraft(page, scenario.draft);
		await page.getByRole('searchbox', { name: 'Find your pick' }).fill(scenario.profile.displayName);

		const group = page.locator(`[data-candidate-group="${scenario.profile.playerId}"]`);
		await expect(group).toHaveCount(0);
		const toggle = page.getByRole('button', { name: 'Show blocked cards', exact: true });
		await expect(toggle).toBeVisible();
		await toggle.click();
		await expect(group).toBeVisible();

		const filter = page.locator('.filters').getByRole('button', { name: scenario.profile.eligibleSlots[0], exact: true });
		await expect(filter).toBeEnabled();
		await group.getByRole('combobox', { name: `Exact season for ${scenario.profile.displayName}`, exact: true }).selectOption(scenario.profile.seasonId);
		await group.locator('button.select-front').click();
		await expect(page.locator('.field-panel .pick-confirmation')).toHaveAttribute('data-selected-season', scenario.profile.seasonId);
		await expect(page.locator('.field-panel').getByRole('button', { name: 'Draft player', exact: true })).toBeDisabled();
	});


	test('keeps a remembered legal alternate and the selected blocked season visible on desktop', async ({ page, request }) => {
		const manifest = await currentManifest(request);
		const scenario = await retentionScenario(request, manifest);
		await openSavedDraft(page, scenario.draft);
		const before = await savedDraft(page);

		await selectWideCandidate(page, scenario.primary);
		await placeAt(page, scenario.slot, page.locator('.field-panel'));
		const group = page.locator(`[data-candidate-group="${scenario.primary.playerId}"]`);
		const selector = group.getByRole('combobox', { name: `Exact season for ${scenario.primary.displayName}`, exact: true });
		await selector.selectOption(scenario.legalAlternative.seasonId);
		const confirmation = page.locator('.field-panel .pick-confirmation');
		await expect(confirmation).toHaveAttribute('data-selected-season', scenario.legalAlternative.seasonId);
		await expect(confirmation).toHaveAttribute('data-pending-slot', scenario.slot);
		await expectNoPersistenceChange(page, before);

		await selector.selectOption(scenario.illegalAlternative.seasonId);
		await expect(confirmation).toHaveAttribute('data-selected-season', scenario.illegalAlternative.seasonId);
		await expect(confirmation).toHaveAttribute('data-pending-slot', '');
		await expect(group.locator(`.player-card[data-season-id="${scenario.illegalAlternative.seasonId}"]`)).toBeVisible();
		await expectNoPersistenceChange(page, before);
	});
	test('uses desktop placement controls for a preview and still requires explicit confirmation', async ({ page, request }) => {
		const manifest = await currentManifest(request);
		const scenario = await cardScenario(request, manifest, () => true);
		await openSavedDraft(page, scenario.draft);
		const before = await savedDraft(page);

		await selectWideCandidate(page, scenario.profile);
		const group = page.locator(`[data-candidate-group="${scenario.profile.playerId}"]`);
		const placement = group.getByRole('button', {
			name: `Preview ${scenario.profile.year} ${scenario.profile.displayName} at ${scenario.slot}`,
			exact: true
		});
		await expect(placement).toBeVisible();
		await placement.click();
		const confirmation = page.locator('.field-panel .pick-confirmation');
		await expect(confirmation).toHaveAttribute('data-selected-season', scenario.profile.seasonId);
		await expect(confirmation).toHaveAttribute('data-pending-slot', scenario.slot);
		await expectNoPersistenceChange(page, before);

		await confirmation.getByRole('button', { name: `Draft at ${scenario.slot}`, exact: true }).click();
		await expect.poll(async () => (await savedDraft(page)).picks.length).toBe(before.picks.length + 1);
	});
});

test.describe('draft sheet interaction boundaries', () => {
	test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

	test('previews a one-slot pitcher and dismisses with keyboard or backdrop without committing', async ({ page, request }) => {
		const manifest = await currentManifest(request);
		const scenario = await findPitcherScenario(request, manifest);
		await openSavedDraft(page, scenario.draft);
		const before = await savedDraft(page);

		await selectNarrowCandidate(page, scenario.profile);
		const sheet = page.locator('dialog.draft-sheet[open]');
		await expect(sheet.locator('.pick-confirmation')).toHaveAttribute('data-pending-slot', scenario.slot);
		await expect(sheet.getByRole('button', { name: `Draft at ${scenario.slot}`, exact: true })).toBeEnabled();
		await expectNoPersistenceChange(page, before);
		await page.keyboard.press('Escape');
		await expect(sheet).toHaveCount(0);
		await expect(page.locator(`[data-candidate-group="${scenario.profile.playerId}"] button.art-trigger`)).toBeFocused();
		await expectNoPersistenceChange(page, before);

		await selectNarrowCandidate(page, scenario.profile);
		await page.mouse.click(195, 8);
		await expect(page.locator('dialog.draft-sheet[open]')).toHaveCount(0);
		await expect(page.locator(`[data-candidate-group="${scenario.profile.playerId}"] button.art-trigger`)).toBeFocused();
		await expectNoPersistenceChange(page, before);
	});

	test('retains a legal exact-season preview through resize and clears an illegal destination without persisting', async ({ page, request }) => {
		const manifest = await currentManifest(request);
		const scenario = await retentionScenario(request, manifest);
		await openSavedDraft(page, scenario.draft);
		const before = await savedDraft(page);

		await selectNarrowCandidate(page, scenario.primary);
		const sheet = page.locator('dialog.draft-sheet[open]');
		await placeAt(page, scenario.slot, sheet);
		const confirmation = sheet.locator('.pick-confirmation');
		await expect(confirmation).toHaveAttribute('data-pending-slot', scenario.slot);

		await page.setViewportSize({ width: 1440, height: 1000 });
		await expect(page.locator('dialog.draft-sheet[open]')).toHaveCount(0);
		const panelConfirmation = page.locator('.field-panel .pick-confirmation');
		await expect(panelConfirmation).toHaveAttribute('data-selected-season', scenario.primary.seasonId);
		await expect(panelConfirmation).toHaveAttribute('data-pending-slot', scenario.slot);
		await expect(page.locator('.field-panel').getByRole('heading', { name: /^Your field/ })).toBeFocused();

		await page.setViewportSize({ width: 390, height: 844 });
		await expect(sheet).toBeVisible();
		await expect(confirmation).toHaveAttribute('data-pending-slot', scenario.slot);
		expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog.draft-sheet[open]')))).toBe(true);

		const selector = sheet.getByRole('combobox', { name: /^Exact season for / });
		await selector.selectOption(scenario.legalAlternative.seasonId);
		await expect(confirmation).toHaveAttribute('data-selected-season', scenario.legalAlternative.seasonId);
		await expect(confirmation).toHaveAttribute('data-pending-slot', scenario.slot);
		await expect(sheet.getByRole('button', { name: `Draft at ${scenario.slot}`, exact: true })).toBeEnabled();

		await selector.selectOption(scenario.illegalAlternative.seasonId);
		await expect(confirmation).toHaveAttribute('data-selected-season', scenario.illegalAlternative.seasonId);
		await expect(confirmation).toHaveAttribute('data-pending-slot', '');
		await expect(sheet.getByRole('button', { name: 'Draft player', exact: true })).toBeDisabled();
		await expectNoPersistenceChange(page, before);
	});

	test('shows the designed back, readable text, and details without mutating the saved draft', async ({ page, request }) => {
		const manifest = await currentManifest(request);
		const scenario = await cardScenario(request, manifest, () => true);
		await openSavedDraft(page, scenario.draft);
		const before = await savedDraft(page);

		await selectNarrowCandidate(page, scenario.profile);
		const sheet = page.locator('dialog.draft-sheet[open]');
		const tabs = sheet.getByRole('tablist', { name: 'Selected player view', exact: true });
		await tabs.getByRole('tab', { name: 'Field', exact: true }).focus();
		await page.keyboard.press('ArrowRight');
		await expect(tabs.getByRole('tab', { name: 'Card back', exact: true })).toBeFocused();
		await expect(tabs.getByRole('tab', { name: 'Card back', exact: true })).toHaveAttribute('aria-selected', 'true');
		await expect(sheet.locator('[role="tabpanel"]:not([hidden]) .card-review .back [data-card][data-face="back"]')).toBeVisible();

		await sheet.getByRole('button', { name: 'Text version', exact: true }).click();
		await expect(sheet.getByRole('region', { name: 'Historical season text version', exact: true })).toBeVisible();
		await sheet.getByRole('button', { name: 'Details', exact: true }).click();
		await expect(sheet.locator('.details[tabindex="-1"]')).toBeFocused();
		await expectNoPersistenceChange(page, before);
	});

	test('uses the specified narrow-grid breakpoints without horizontal overflow or undersized primary controls', async ({ page, request }) => {
		const manifest = await currentManifest(request);
		const scenario = await cardScenario(request, manifest, () => true);
		await openSavedDraft(page, scenario.draft);

		for (const [width, height, columns] of [[320, 740, 2], [374, 740, 2], [375, 812, 3], [402, 874, 3], [820, 1180, 5]] as const) {
			await page.setViewportSize({ width, height });
			await expect(page.locator('.card-grid').first()).toBeVisible();
			expect(await page.locator('.card-grid').first().evaluate(element => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length)).toBe(columns);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			const sizes = await page.locator('button.art-trigger, .open-field').evaluateAll(buttons => buttons.map(button => {
				const box = button.getBoundingClientRect();
				return { width: box.width, height: box.height };
			}));
			expect(sizes.length).toBeGreaterThan(0);
			for (const size of sizes) {
				expect(size.width).toBeGreaterThanOrEqual(44);
				expect(size.height).toBeGreaterThanOrEqual(44);
			}
		}

		await selectNarrowCandidate(page, scenario.profile);
		const slot = scenario.slot;
		const target = page.locator(`dialog.draft-sheet[open] [data-slot="${slot}"]`);
		const box = await target.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.width).toBeGreaterThanOrEqual(44);
		expect(box!.height).toBeGreaterThanOrEqual(44);
	});
});
