import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
	availableCandidates,
	commitPick,
	createDraft,
	legalReassignments,
	legalSlots,
	reassignPick,
	rollDraft,
	type LegalReassignment
} from '../lib/game/draft.ts';
import { HITTER_SLOTS, SLOTS, type Candidate, type Draft, type HitterSlot, type Manifest, type Profile } from '../lib/game/types.ts';

const STORAGE_KEY = '162-zero:v1';
const FIXTURE_SEED = 2;

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(180000);

interface AssignmentScenario {
	draft: Draft;
	target: Candidate;
	targetSlot: HitterSlot;
	occupantSeasonId: string;
	move: LegalReassignment;
	swap: { seasonId: string; origin: HitterSlot; destination: HitterSlot; swapWith: string };
}

async function currentManifest(request: APIRequestContext): Promise<Manifest> {
	const pointerResponse = await request.get('/data/current.json');
	expect(pointerResponse.ok()).toBe(true);
	const pointer = await pointerResponse.json() as { manifestUrl: string };
	const manifestResponse = await request.get(pointer.manifestUrl);
	expect(manifestResponse.ok()).toBe(true);
	return manifestResponse.json() as Promise<Manifest>;
}

function displayedCandidates(draft: Draft, manifest: Manifest): Candidate[] {
	if (!draft.currentRoll) return [];
	const bySeason = new Map(manifest.candidates.map(candidate => [candidate.seasonId, candidate]));
	const usedPlayerIds = new Set(draft.picks
		.map(pick => bySeason.get(pick.seasonId)?.playerId)
		.filter((playerId): playerId is string => !!playerId));
	const usedFranchises = new Set(draft.picks.map(pick => pick.franchiseId));
	return manifest.candidates.filter(candidate =>
		candidate.franchiseId === draft.currentRoll!.franchiseId &&
		candidate.decade === draft.currentRoll!.decade &&
		!usedPlayerIds.has(candidate.playerId) &&
		!usedFranchises.has(candidate.franchiseId)
	);
}

function pendingAssignmentScenario(manifest: Manifest): AssignmentScenario {
	let draft = createDraft(manifest, FIXTURE_SEED);
	while (draft.picks.length < SLOTS.length - 1) {
		draft = rollDraft(draft, manifest);
		for (const target of displayedCandidates(draft, manifest)) {
			if (legalSlots(draft, target, manifest).length > 0) continue;
			for (const targetSlot of target.eligibleSlots) {
				if (!HITTER_SLOTS.includes(targetSlot as HitterSlot)) continue;
				const occupant = draft.picks.find(pick => pick.slot === targetSlot);
				if (!occupant) continue;
				for (const move of legalReassignments(draft, manifest, occupant.seasonId)) {
					if (move.swapWith !== null) continue;
					const moved = reassignPick(draft, manifest, occupant.seasonId, move.slot);
					if (!legalSlots(moved, target, manifest).includes(targetSlot)) continue;
					for (const pick of moved.picks) {
						if (pick.seasonId === occupant.seasonId) continue;
						const swap = legalReassignments(moved, manifest, pick.seasonId).find(option => option.swapWith !== null);
						if (!swap?.swapWith) continue;
						if (swap.swapWith === occupant.seasonId) continue;
						const swapped = reassignPick(moved, manifest, pick.seasonId, swap.slot);
						if (!legalSlots(swapped, target, manifest).includes(targetSlot)) continue;
						return {
							draft,
							target,
							targetSlot: targetSlot as HitterSlot,
							occupantSeasonId: occupant.seasonId,
							move,
							swap: { seasonId: pick.seasonId, origin: pick.slot as HitterSlot, destination: swap.slot, swapWith: swap.swapWith }
						};
					}
				}
			}
		}
		const candidate = availableCandidates(draft, manifest)[0];
		if (!candidate) throw new Error('Deterministic fixture roll has no candidate');
		const slots = legalSlots(draft, candidate, manifest);
		const slot = slots.find(value => value !== 'DH') ?? slots[0];
		if (!slot) throw new Error('Deterministic fixture candidate has no legal slot');
		draft = commitPick(draft, manifest, candidate.seasonId, slot);
	}
	throw new Error(`Seed ${FIXTURE_SEED} no longer produces the assignment fixture`);
}

async function targetProfile(request: APIRequestContext, manifest: Manifest, scenario: AssignmentScenario): Promise<Profile> {
	const roll = scenario.draft.currentRoll!;
	const response = await request.get(manifest.chunks[`${roll.franchiseId}-${roll.decade}`]);
	expect(response.ok()).toBe(true);
	const profiles = await response.json() as Profile[];
	const profile = profiles.find(candidate => candidate.seasonId === scenario.target.seasonId);
	if (!profile) throw new Error('Assignment fixture profile is absent from its current-roll chunk');
	return profile;
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

function assignment(page: Page, seasonId: string) {
	return page.locator(`[data-roster-assignment="${seasonId}"]`);
}

test('keeps a blocked season selected through moves and swaps, then restores the pending roll', async ({ page, request }) => {
	const manifest = await currentManifest(request);
	const scenario = pendingAssignmentScenario(manifest);
	const profile = await targetProfile(request, manifest, scenario);
	const pendingRoll = scenario.draft.currentRoll;
	const pickCount = scenario.draft.picks.length;
	await openSavedDraft(page, scenario.draft);

	const search = page.getByRole('searchbox', { name: 'Find your pick' });
	await page.locator('.filters').getByRole('button', { name: scenario.targetSlot, exact: true }).click();
	await search.fill(profile.displayName);
	const season = page.locator(`[data-candidate-group="${scenario.target.playerId}"]`);
	const seasonSelector = season.getByRole('combobox', { name: `Exact season for ${profile.displayName}`, exact: true });
	await expect(seasonSelector).toBeVisible();
	await seasonSelector.selectOption(scenario.target.seasonId);
	const card = season.locator(`.player-card[data-season-id="${scenario.target.seasonId}"]`);
	await expect(card).toBeVisible();
	await card.getByRole('button', { name: 'Inspect card', exact: true }).click();
	const dialog = page.locator('dialog.card-inspection[open]');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Turn over', exact: true })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);

	const choose = card.locator(`[data-choose-season="${scenario.target.seasonId}"]`);
	await expect(choose).toHaveAccessibleName(`Choose ${profile.year}`);
	await choose.click();
	const dock = page.locator('.assignment-dock');
	await expect(dock).toBeVisible();
	await expect(dock).toBeFocused();
	const clear = dock.getByRole('button', { name: 'Clear selection', exact: true });
	await expect(clear).toBeVisible();
	await expect(dock.getByRole('button', { name: 'Draft player', exact: true })).toBeDisabled();
	await expect(dock).toContainText('Reassign your roster to make room.');
	const dockBox = await dock.boundingBox();
	expect(dockBox).not.toBeNull();
	expect(dockBox!.y + dockBox!.height).toBeLessThanOrEqual(844);

	await clear.click();
	await expect(dock).toHaveCount(0);
	await expect(choose).toBeFocused();
	await choose.click();
	await expect(dock).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(dock).toHaveCount(0);
	await expect(choose).toBeFocused();
	await choose.click();
	await page.locator('.roster > details > summary').click();

	const occupant = assignment(page, scenario.occupantSeasonId);
	await occupant.locator('[data-assignment-select]').selectOption(scenario.move.slot);
	await expect(occupant.locator('[data-assignment-action]')).toHaveText('Move');
	await occupant.locator('[data-assignment-action]').click();

	await expect(card.getByRole('button', { name: `Clear selection`, exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(card.locator('[data-card][data-face="front"]').first()).toBeVisible();
	await expect(dock.locator(`input[value="${scenario.targetSlot}"]`)).toBeVisible();
	let saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY) as Draft;
	expect(saved.currentRoll).toEqual(pendingRoll);
	expect(saved.picks).toHaveLength(pickCount);
	expect(saved.picks.find(pick => pick.seasonId === scenario.occupantSeasonId)?.slot).toBe(scenario.move.slot);

	await dock.locator(`input[value="${scenario.targetSlot}"]`).check();
	await occupant.locator('[data-assignment-select]').selectOption(scenario.targetSlot);
	await occupant.locator('[data-assignment-action]').click();
	await expect(dock.locator('input:checked')).toHaveCount(0);
	await expect(card.locator('[data-card][data-face="front"]').first()).toBeVisible();
	await occupant.locator('[data-assignment-select]').selectOption(scenario.move.slot);
	await occupant.locator('[data-assignment-action]').click();
	await dock.locator(`input[value="${scenario.targetSlot}"]`).check();

	const swap = assignment(page, scenario.swap.seasonId);
	await swap.locator('[data-assignment-select]').selectOption(scenario.swap.destination);
	await expect(swap.locator('[data-assignment-action]')).toHaveText('Swap');
	await swap.locator('[data-assignment-action]').click();
	await expect(card.getByRole('button', { name: 'Clear selection', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(dock.locator(`input[value="${scenario.targetSlot}"]`)).toBeChecked();

	saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY) as Draft;
	expect(saved.currentRoll).toEqual(pendingRoll);
	expect(saved.picks).toHaveLength(pickCount);
	expect(saved.picks.find(pick => pick.seasonId === scenario.swap.seasonId)?.slot).toBe(scenario.swap.destination);
	expect(saved.picks.find(pick => pick.seasonId === scenario.swap.swapWith)?.slot).toBe(scenario.swap.origin);

	await page.reload();
	await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
	await expect(page.getByRole('searchbox', { name: 'Find your pick' })).toBeVisible();
	const restored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY) as Draft;
	expect(restored.currentRoll).toEqual(pendingRoll);
	expect(restored.picks).toEqual(saved.picks);
	await page.locator('.roster > details > summary').click();
	await expect(assignment(page, scenario.occupantSeasonId).locator('[data-assignment-select]')).toHaveValue(scenario.move.slot);
	await expect(assignment(page, scenario.swap.seasonId).locator('[data-assignment-select]')).toHaveValue(scenario.swap.destination);
	await page.locator('.roster > details > summary').click();
	await search.fill(profile.displayName);
	const restoredSelector = season.getByRole('combobox', { name: `Exact season for ${profile.displayName}`, exact: true });
	await restoredSelector.selectOption(scenario.target.seasonId);
	const restoredCard = season.locator(`.player-card[data-season-id="${scenario.target.seasonId}"]`);
	await expect(restoredCard).toBeVisible();
	await restoredCard.getByRole('button', { name: 'Inspect card', exact: true }).click();
	const restoredDialog = page.locator('dialog.card-inspection[open]');
	await expect(restoredDialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(restoredDialog).toHaveCount(0);
	await restoredCard.getByRole('button', { name: `Choose ${profile.year}`, exact: true }).click();
	await page.locator(`.assignment-dock input[value="${scenario.targetSlot}"]`).check();
	await page.getByRole('button', { name: `Draft player at ${scenario.targetSlot}`, exact: true }).click();
	const completed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY) as Draft;
	expect(completed.picks.at(-1)?.seasonId).toBe(scenario.target.seasonId);
	expect(completed.schemaVersion).toBe(3);
	if (completed.schemaVersion !== 3) throw new Error('Expected a current replay after drafting the exact card season');
	expect(completed.actions.at(-1)).toEqual({ type: 'pick', seasonId: scenario.target.seasonId, slot: scenario.targetSlot });
});
