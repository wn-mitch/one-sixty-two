import type { Page } from '@playwright/test';
import { prepareSeasonInput, simulateSeason } from '../../src/lib/sim/season.ts';
import { createExampleFixtures } from '../../src/lib/storybook/fixtures.ts';
import { getExampleSeason, type ExampleSeason } from '../../src/lib/storybook/season-fixtures.ts';
import { expect, openStory, test } from './workshop-test.ts';

let example: ExampleSeason;

test.beforeAll(async () => {
	example = await getExampleSeason();
});

async function waitForResult(page: Page): Promise<void> {
	await expect(page.getByRole('heading', { name: /final record/i })).toBeVisible({ timeout: 15_000 });
}

async function expectFinalRecord(page: Page, result: ExampleSeason['result']): Promise<void> {
	await expect(page.getByRole('heading', { name: /final record/i })).toHaveAttribute(
		'aria-label',
		`Final record: ${result.wins} wins and ${result.losses} losses`
	);
}

test.describe('application workshop stories', () => {
	test('starts or resumes a draft, and reset restores the welcome state', async ({ page }) => {
		await openStory(page, 'application-welcome--start');
		await page.getByRole('button', { name: /start draft/i }).click();
		await expect(page.locator('.draft-board')).toBeVisible();
		await expect(page.locator('.picked-count')).toContainText('0');
		await page.getByRole('button', { name: 'Reset story', exact: true }).click();
		await expect(page.getByRole('heading', { name: /can you go/i })).toBeVisible();

		await openStory(page, 'application-welcome--resume-available');
		await page.getByRole('button', { name: /resume draft/i }).click();
		await expect(page.locator('.draft-board')).toBeVisible();
		await expect(page.locator('.picked-count')).toContainText('6');
		await page.getByRole('button', { name: 'Reset story', exact: true }).click();
		await expect(page.getByRole('button', { name: /resume draft/i })).toBeVisible();
	});

	test('keeps welcome actions unavailable while its data is loading', async ({ page }) => {
		await openStory(page, 'application-welcome--loading');
		await expect(page.getByRole('button', { name: /start draft/i })).toBeDisabled();
		await expect(page.getByRole('status')).toBeVisible();
	});

	test('edits batting order, restores it, and simulates the edited draft', async ({ page }) => {
		const fixtures = createExampleFixtures();
		const edited = {
			...fixtures.completeDraft,
			battingOrder: [...fixtures.completeDraft.battingOrder]
		};
		[edited.battingOrder[0], edited.battingOrder[1]] = [edited.battingOrder[1]!, edited.battingOrder[0]!];
		const expected = simulateSeason(prepareSeasonInput(edited, fixtures.profiles, fixtures.simulationData));
		const firstName = fixtures.profiles.find((profile) => profile.seasonId === edited.battingOrder[0])!.displayName;
		const originalFirstName = fixtures.profiles.find(profile => profile.seasonId === fixtures.completeDraft.battingOrder[0])!.displayName;

		await openStory(page, 'lineup-editor--complete');
		const firstCard = page.locator('.order').first().locator('li').first();
		await firstCard.getByRole('button', { name: /down in batting order/i }).click();
		await expect(firstCard.locator('.order-heading .name')).toHaveText(firstName);
		await expect(page.locator('.announcement')).toContainText(/moved to batting position 2/i);
		await page.getByRole('button', { name: 'Reset story', exact: true }).click();
		await expect(firstCard.locator('.order-heading .name')).toHaveText(originalFirstName);

		await firstCard.getByRole('button', { name: /down in batting order/i }).click();
		await page.getByRole('button', { name: /simulate 162 games/i }).click();
		await expect(page.getByRole('button', { name: /skip animation/i })).toBeVisible();
		await page.getByRole('button', { name: /skip animation/i }).click();
		await waitForResult(page);
		await expectFinalRecord(page, expected);
		const firstGame = page.locator('.game-detail').first();
		await expect(page.locator('.game-detail summary .score')).toHaveText(expected.games.map(game => `${game.challengeRuns}–${game.opponentRuns}`));
		await firstGame.locator('summary').click();
		const game = expected.games[0];
		const challenge = game.isHome ? game.home : game.away;
		await expect(firstGame.getByRole('region', { name: `${challenge.name} batting box score for game ${game.number}`, exact: true })
			.locator('tbody th[scope="row"]')).toHaveText(challenge.batting.map(line => line.displayName));
	});

	test('disables simulation for missing profiles and swaps flexible outfield assignments without replacing seasons', async ({ page }) => {
		await openStory(page, 'lineup-editor--missing-profile');
		await expect(page.getByRole('button', { name: /simulate 162 games/i })).toBeDisabled();

		await openStory(page, 'lineup-editor--complete');
		const left = page.locator('[data-roster-assignment]').filter({ has: page.getByLabel(/position for example batter 06/i) });
		const center = page.locator('[data-roster-assignment]').filter({ has: page.getByLabel(/position for example batter 07/i) });
		const leftId = await left.getAttribute('data-roster-assignment');
		const centerId = await center.getAttribute('data-roster-assignment');
		await expect(left.getByLabel(/position for example batter 06/i)).toHaveValue('LF');
		await expect(center.getByLabel(/position for example batter 07/i)).toHaveValue('CF');
		await left.getByLabel(/position for example batter 06/i).selectOption('CF');
		await expect(left.locator('[data-assignment-action]')).toBeEnabled();
		await page.getByRole('button', { name: 'Reset story', exact: true }).click();
		await expect(left.getByLabel(/position for example batter 06/i)).toHaveValue('LF');
		await expect(left.locator('[data-assignment-action]')).toBeDisabled();
		await expect(page.locator('.announcement')).toHaveText('');

		await left.getByLabel(/position for example batter 06/i).selectOption('CF');
		await left.getByRole('button', { name: /swap example batter 06 to cf/i }).click();
		await expect(left).toHaveAttribute('data-roster-assignment', leftId!);
		await expect(center).toHaveAttribute('data-roster-assignment', centerId!);
		await expect(left.getByLabel(/position for example batter 06/i)).toHaveValue('CF');
		await expect(center.getByLabel(/position for example batter 07/i)).toHaveValue('LF');
	});

	test('reveals a real partial record and keeps replay output stable across resets', async ({ page }) => {
		await openStory(page, 'simulation-season--partial-reveal');
		const partialGames = example.result.games.slice(0, 42);
		const partialWins = partialGames.filter((game) => game.win).length;
		await expect(page.getByLabel('Season simulation progress')).toHaveJSProperty('value', 42);
		await expect(page.locator('.record .win')).toHaveText(`${partialWins} W`);
		await expect(page.locator('.record .loss')).toHaveText(`${partialGames.length - partialWins} L`);
		await page.getByRole('button', { name: /skip animation/i }).click();
		await waitForResult(page);
		await expectFinalRecord(page, example.result);

		await openStory(page, 'simulation-season--replay');
		await page.getByRole('button', { name: /skip animation/i }).click();
		await waitForResult(page);
		const scores = example.result.games.map(game => `${game.challengeRuns}–${game.opponentRuns}`);
		for (const action of ['Replay animation', 'Reset story']) {
			await page.getByRole('button', { name: action, exact: true }).click();
			await expect(page.getByRole('progressbar', { name: 'Season simulation progress' })).toBeVisible();
			await page.getByRole('button', { name: /skip animation/i }).click();
			await waitForResult(page);
			await expect(page.locator('.game-detail summary .score')).toHaveText(scores);
			await expectFinalRecord(page, example.result);
		}
	});

	test('can skip computing directly to the locked final result', async ({ page }) => {
		await openStory(page, 'simulation-season--computing&args=completed:73');
		await expect(page.getByLabel('Season simulation progress')).toHaveJSProperty('value', 73);
		await page.getByRole('button', { name: /skip animation/i }).click();
		await waitForResult(page);
		await expectFinalRecord(page, example.result);
	});

	test('renders result details and navigates through the full result', async ({ page }) => {
		await openStory(page, 'results-season--complete');
		await waitForResult(page);
		const loss = example.result.games.find((game) => !game.win)!;
		await expect(page.locator('.game-detail').nth(loss.number - 1).locator('.game-number')).toContainText(`Game ${loss.number}`);
		const finalDetails = page.locator('.game-detail').last();
		const lastGame = example.result.games.at(-1)!;
		await expect(finalDetails.locator('.game-content')).toHaveCount(0);
		await finalDetails.locator('summary').click();
		const inningCount = Math.max(9, lastGame.away.innings.length, lastGame.home.innings.length);
		await expect(finalDetails.locator('.line-score tbody tr').first().locator('td')).toHaveText([
			...Array.from({ length: inningCount }, (_, index) => lastGame.away.innings[index] == null ? '–' : String(lastGame.away.innings[index])),
			String(lastGame.away.runs)
		]);
		await expect(finalDetails.getByRole('region', { name: /batting box score/i }).first()).toBeVisible();
		await page.getByRole('button', { name: /batting totals/i }).click();
		await expect(page.getByRole('heading', { name: 'Batting' })).toBeFocused();
		await page.getByRole('button', { name: /inspect .* card/i }).first().click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toBeHidden();
		await page.getByRole('button', { name: /new draft/i }).click();
		await expect(page.locator('.draft-board')).toBeVisible();
	});

	test('shows publication and publishing failure states', async ({ page }) => {
		await openStory(page, 'results-season--share-link');
		await expect(page.locator('#published-share-link')).toHaveValue(/example\.invalid/);
		await expect(page.getByRole('status')).toContainText(/no upload/i);
		await openStory(page, 'results-season--share-unavailable');
		await expect(page.getByRole('alert')).toContainText(/unavailable/i);
	});

	test('uses real game boxes and both turning point branches', async ({ page }) => {
		await openStory(page, 'results-details--game');
		const game = example.result.games[0]!;
		await expect(page.locator('details.game-detail')).toContainText(`Game ${game.number}`);
		await page.locator('details.game-detail summary').click();
		await expect(page.getByRole('region', { name: /inning line score/i })).toContainText(String(game.challengeRuns));
		await expect(page.getByRole('region', { name: /batting box score/i }).first()).toBeVisible();

		await openStory(page, 'results-details--turning-points');
		await expect(page.getByRole('heading', { name: /season turning points/i })).toBeVisible();
		await page.getByRole('button', { name: /inspect .*season (highlight|lowlight)/i }).first().click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await openStory(page, 'results-details--no-turning-points');
		await expect(page.getByText(/no positive win-expectancy swing/i)).toBeVisible();
		await expect(page.getByText(/no negative win-expectancy swing/i)).toBeVisible();
	});
});
