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
import { currentManifest, openSavedDraft, STORAGE_KEY } from './draft-test-fixtures.ts';

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

async function selectExactTarget(page: Page, profile: Profile, seasonId: string) {
	const search = page.getByRole('searchbox', { name: 'Find your pick' });
	await search.fill(profile.displayName);
	const group = page.locator('.candidate-card').filter({ has: page.getByText(profile.displayName, { exact: true }).first() });
	await expect(group).toHaveCount(1);
	const select = group.getByRole('button', { name: /^Select / }).first();
	await select.click();
	const sheet = page.locator('dialog.draft-sheet[open]');
	await expect(sheet).toBeVisible();
	await sheet.getByRole('combobox', { name: `Exact season for ${profile.displayName}`, exact: true }).selectOption(seasonId);
	return { group, select, sheet };
}

function fieldSlot(page: Page, slot: string) {
	return page.locator(`dialog.draft-sheet[open] [data-slot="${slot}"]`);
}

async function savedDraft(page: Page): Promise<Draft> {
	return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY) as Promise<Draft>;
}

test('keeps a blocked season selected through moves and swaps, then restores the pending roll', async ({ page, request }) => {
	const manifest = await currentManifest(request);
	const scenario = pendingAssignmentScenario(manifest);
	const profile = await targetProfile(request, manifest, scenario);
	const pendingRoll = scenario.draft.currentRoll;
	const pickCount = scenario.draft.picks.length;
	const origin = scenario.draft.picks.find(pick => pick.seasonId === scenario.occupantSeasonId)?.slot;
	if (!origin || !HITTER_SLOTS.includes(origin as HitterSlot)) throw new Error('Assignment fixture occupant is not a hitter');
	await openSavedDraft(page, scenario.draft);

	let selected = await selectExactTarget(page, profile, scenario.target.seasonId);
	const confirmation = selected.sheet.locator('.pick-confirmation');
	await expect(confirmation).toHaveAttribute('data-selected-season', scenario.target.seasonId);
	await expect(confirmation).toHaveAttribute('data-pending-slot', '');
	await expect(confirmation).toContainText('Reassign your roster to make room.');
	await expect(confirmation.getByRole('button', { name: 'Draft player', exact: true })).toBeDisabled();

	await confirmation.getByRole('button', { name: 'Cancel selection', exact: true }).click();
	await expect(page.locator('dialog.draft-sheet[open]')).toHaveCount(0);
	await expect(selected.select).toBeFocused();
	selected = await selectExactTarget(page, profile, scenario.target.seasonId);
	await page.keyboard.press('Escape');
	await expect(page.locator('dialog.draft-sheet[open]')).toHaveCount(0);
	await expect(selected.select).toBeFocused();
	selected = await selectExactTarget(page, profile, scenario.target.seasonId);
	await selected.sheet.getByRole('tab', { name: 'Card back', exact: true }).click();
	const disclosures = selected.sheet.locator('[role="tabpanel"]:not([hidden]) .card-review');
	await disclosures.getByRole('button', { name: 'Text version', exact: true }).click();
	await disclosures.getByRole('button', { name: 'Details', exact: true }).click();
	await selected.sheet.getByRole('tab', { name: 'Field', exact: true }).click();

	await fieldSlot(page, origin).click();
	await expect(selected.sheet.getByRole('button', { name: 'Cancel move', exact: true })).toBeVisible();
	await expect(selected.sheet.getByRole('button', { name: 'Inspect card', exact: true })).toBeVisible();
	await selected.sheet.getByRole('button', { name: 'Inspect card', exact: true }).click();
	await selected.sheet.getByRole('button', { name: 'Back to field', exact: true }).click();
	await selected.sheet.getByRole('tab', { name: 'Card back', exact: true }).click();
	await expect(selected.sheet.locator('[role="tabpanel"]:not([hidden]) .inspection-back')).toBeVisible();
	await expect(selected.sheet.locator('[role="tabpanel"]:not([hidden]) .details')).toBeVisible();
	await selected.sheet.getByRole('tab', { name: 'Field', exact: true }).click();
	await selected.sheet.getByRole('button', { name: 'Cancel move', exact: true }).click();
	await expect(selected.sheet.getByRole('heading', { name: /^Your field/ })).toBeFocused();
	await expect(selected.sheet.locator('.pick-confirmation')).toHaveAttribute('data-selected-season', scenario.target.seasonId);
	await fieldSlot(page, origin).click();
	await fieldSlot(page, scenario.move.slot).click();
	await expect.poll(async () => (await savedDraft(page)).picks.find(pick => pick.seasonId === scenario.occupantSeasonId)?.slot).toBe(scenario.move.slot);
	let saved = await savedDraft(page);
	expect(saved.currentRoll).toEqual(pendingRoll);
	expect(saved.picks).toHaveLength(pickCount);
	await expect(selected.sheet.locator('.pick-confirmation')).toHaveAttribute('data-selected-season', scenario.target.seasonId);
	await expect(selected.sheet.locator('.pick-confirmation')).toHaveAttribute('data-pending-slot', '');

	await fieldSlot(page, scenario.targetSlot).click();
	await expect(selected.sheet.locator('.pick-confirmation')).toHaveAttribute('data-pending-slot', scenario.targetSlot);
	await fieldSlot(page, scenario.move.slot).click();
	await expect(selected.sheet.getByRole('button', { name: 'Cancel move', exact: true })).toBeVisible();
	await fieldSlot(page, scenario.targetSlot).click();
	await expect.poll(async () => (await savedDraft(page)).picks.find(pick => pick.seasonId === scenario.occupantSeasonId)?.slot).toBe(scenario.targetSlot);
	await expect(selected.sheet.locator('.pick-confirmation')).toHaveAttribute('data-pending-slot', '');

	await fieldSlot(page, scenario.targetSlot).click();
	await fieldSlot(page, scenario.move.slot).click();
	await expect.poll(async () => (await savedDraft(page)).picks.find(pick => pick.seasonId === scenario.occupantSeasonId)?.slot).toBe(scenario.move.slot);
	await expect(selected.sheet.locator('.pick-confirmation')).toHaveAttribute('data-selected-season', scenario.target.seasonId);
	await expect(selected.sheet.locator('.pick-confirmation')).toHaveAttribute('data-pending-slot', '');

	await fieldSlot(page, scenario.targetSlot).click();
	await expect(selected.sheet.locator('.pick-confirmation')).toHaveAttribute('data-pending-slot', scenario.targetSlot);
	await fieldSlot(page, scenario.swap.origin).click();
	await expect(selected.sheet.getByRole('button', { name: 'Cancel move', exact: true })).toBeVisible();
	await fieldSlot(page, scenario.swap.destination).click();
	await expect.poll(async () => (await savedDraft(page)).picks.find(pick => pick.seasonId === scenario.swap.seasonId)?.slot).toBe(scenario.swap.destination);
	await expect(selected.sheet.locator('.pick-confirmation')).toHaveAttribute('data-selected-season', scenario.target.seasonId);
	await expect(selected.sheet.locator('.pick-confirmation')).toHaveAttribute('data-pending-slot', scenario.targetSlot);

	saved = await savedDraft(page);
	expect(saved.currentRoll).toEqual(pendingRoll);
	expect(saved.picks).toHaveLength(pickCount);
	expect(saved.picks.find(pick => pick.seasonId === scenario.swap.swapWith)?.slot).toBe(scenario.swap.origin);

	await page.reload();
	await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
	await expect(page.getByRole('searchbox', { name: 'Find your pick' })).toBeVisible();
	const restored = await savedDraft(page);
	expect(restored.currentRoll).toEqual(pendingRoll);
	expect(restored.picks).toEqual(saved.picks);
	await page.getByRole('button', { name: /^Open your field/ }).click();
	const restoredSheet = page.locator('dialog.draft-sheet[open]');
	await expect(restoredSheet).toBeVisible();
	await expect(fieldSlot(page, scenario.move.slot)).toBeVisible();
	await expect(fieldSlot(page, scenario.targetSlot)).toHaveAttribute('aria-label', expect.stringContaining('open'));
	await restoredSheet.getByRole('button', { name: 'Close field', exact: true }).click();
	selected = await selectExactTarget(page, profile, scenario.target.seasonId);
	await fieldSlot(page, scenario.targetSlot).click();
	await expect(selected.sheet.getByRole('button', { name: `Draft at ${scenario.targetSlot}`, exact: true })).toBeEnabled();
	await selected.sheet.getByRole('button', { name: `Draft at ${scenario.targetSlot}`, exact: true }).click();
	await expect.poll(async () => (await savedDraft(page)).actions?.at(-1)).toEqual({ type: 'pick', seasonId: scenario.target.seasonId, slot: scenario.targetSlot });
	const completed = await savedDraft(page);
	expect(completed.picks.at(-1)?.seasonId).toBe(scenario.target.seasonId);
	expect(completed.schemaVersion).toBe(4);
	expect(completed.actions?.at(-1)).toEqual({ type: 'pick', seasonId: scenario.target.seasonId, slot: scenario.targetSlot });
});
