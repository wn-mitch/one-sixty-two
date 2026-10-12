import type { Page } from '@playwright/test';
import { simulateSeason } from '../../src/lib/engine/node.ts';
import { prepareSeasonInput } from '../../src/lib/game/season-input.ts';
import { BATTING_COLUMNS, sortLines } from '../../src/lib/components/stat-sort.ts';
import { createExampleFixtures } from '../../src/lib/storybook/fixtures.ts';
import { getExampleSeason, type ExampleSeason } from '../../src/lib/storybook/season-fixtures.ts';
import { expect, openStory, test } from './workshop-test.ts';

let example: ExampleSeason;

test.beforeAll(async () => {
	example = await getExampleSeason();
});

/** Every game in the results calendar, one control per game, including both halves of a doubleheader. */
const SEASON_GAME = '[aria-controls="season-game-detail"]';

/** Final scores in calendar order, read from each game control's label. */
function calendarScores(page: Page): Promise<string[]> {
	return page.locator(SEASON_GAME).evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')!.match(/(?:won|lost) (\d+–\d+)/)![1]));
}

async function openGame(page: Page, index: number): Promise<void> {
	await page.locator(SEASON_GAME).nth(index).click();
	await page.locator('#season-game-detail summary', { hasText: 'Batting and pitching' }).click();
}

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

	test('fits every welcome era without a scrolling rail', async ({ page }) => {
		await openStory(page, 'application-welcome--start');
		const strip = page.getByRole('region', { name: 'Card designs from eight eras', exact: true });
		await expect(strip.locator('figure')).toHaveCount(8);
		for (const width of [320, 402, 768, 1212]) {
			await page.setViewportSize({ width, height: 788 });
			await expect.poll(() => strip.evaluate(root => {
				const bounds = root.getBoundingClientRect();
				const style = getComputedStyle(root);
				return !['auto', 'scroll'].includes(style.overflowX) &&
					[...root.querySelectorAll('figure')].every(figure => {
						const card = figure.getBoundingClientRect();
						return card.left >= bounds.left - 1 && card.right <= bounds.right + 1;
					});
			})).toBe(true);
		}
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
		await expect(firstCard.locator('.identity .name')).toHaveText(firstName);
		await expect(page.locator('.announcement')).toContainText(/moved to batting position 2/i);
		await page.getByRole('button', { name: 'Reset story', exact: true }).click();
		await expect(firstCard.locator('.identity .name')).toHaveText(originalFirstName);

		await firstCard.getByRole('button', { name: /down in batting order/i }).click();
		await page.getByRole('button', { name: /simulate 162 games/i }).click();
		// The workshop simulates on the main thread after the lineup's exit, which runs past the default wait under parallel workers.
		await expect(page.getByRole('button', { name: /skip animation/i })).toBeVisible({ timeout: 15000 });
		await page.getByRole('button', { name: /skip animation/i }).click();
		await waitForResult(page);
		await expectFinalRecord(page, expected);
		expect(await calendarScores(page)).toEqual(expected.games.map(game => `${game.challengeRuns}–${game.opponentRuns}`));
		await openGame(page, 0);
		const firstGame = page.locator('#season-game-detail');
		const game = expected.games[0];
		const challenge = game.isHome ? game.home : game.away;
		await expect(firstGame.getByRole('region', { name: `${challenge.name} batting box score for Game ${game.number}`, exact: true })
			.locator('tbody th[scope="row"]')).toHaveText(challenge.batting.map(line => `${line.displayName}${line.position} · ${line.year}`));
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
		const leftSelect = left.getByLabel(/position for example batter 06/i);
		await expect(leftSelect.locator('option[value="CF"]')).toHaveText('CF · swap with Example Batter 07');
		await expect(leftSelect.locator('option[value="LF"]')).toHaveText('LF');
		await leftSelect.selectOption('CF');
		await expect(left).toHaveAttribute('data-roster-assignment', leftId!);
		await expect(center).toHaveAttribute('data-roster-assignment', centerId!);
		await expect(leftSelect).toHaveValue('CF');
		await expect(center.getByLabel(/position for example batter 07/i)).toHaveValue('LF');
		await expect(page.locator('.announcement')).toHaveText('Example Batter 06 moved to CF; Example Batter 07 moves to LF.');

		await page.getByRole('button', { name: 'Reset story', exact: true }).click();
		await expect(leftSelect).toHaveValue('LF');
		await expect(page.locator('.announcement')).toHaveText('');
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
			expect(await calendarScores(page)).toEqual(scores);
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
		await expect(page.locator(SEASON_GAME).nth(loss.number - 1)).toHaveAttribute('aria-label', new RegExp(`^Game ${loss.number}, .+, lost `));
		const finalDetails = page.locator('#season-game-detail');
		const lastGame = example.result.games.at(-1)!;
		await expect(finalDetails.locator('.game-content')).toHaveCount(0);
		await openGame(page, lastGame.number - 1);
		await expect(finalDetails.getByRole('heading', { name: new RegExp(`^Game ${lastGame.number}`) })).toBeVisible();
		const inningCount = Math.max(9, lastGame.away.innings.length, lastGame.home.innings.length);
		await expect(finalDetails.locator('.line-score tbody tr').first().locator('td')).toHaveText([
			...Array.from({ length: inningCount }, (_, index) => lastGame.away.innings[index] == null ? '–' : String(lastGame.away.innings[index])),
			String(lastGame.away.runs)
		]);
		await expect(finalDetails.getByRole('region', { name: /batting box score/i }).first()).toBeVisible();
		await page.getByRole('button', { name: /batting totals/i }).click();
		await expect(page.getByRole('heading', { name: 'Batting' })).toBeFocused();
		const inspect = page.getByRole('button', { name: /inspect .* card/i }).first();
		await inspect.click();
		await expect(page.locator('.card-review')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('.card-review')).toBeVisible();
		await page.getByRole('button', { name: 'Hide card', exact: true }).click();
		await expect(page.locator('.card-review')).toHaveCount(0);
		await expect(inspect).toBeFocused();
		await page.getByRole('button', { name: /new draft/i }).click();
		await expect(page.locator('.draft-board')).toBeVisible();
	});

	test('keeps dense season totals and the last statistic reachable on a phone', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 874 });
		await openStory(page, 'results-season--complete');
		await waitForResult(page);
		const batting = page.getByRole('region', { name: 'Season batting totals', exact: true });
		await batting.scrollIntoViewIfNeeded();
		await expect(batting).toHaveAttribute('tabindex', '0');
		const firstIdentity = batting.locator('tbody th').first();
		const initialLeft = (await firstIdentity.boundingBox())!.x;
		const rowHeight = (await batting.locator('tbody tr').first().boundingBox())!.height;
		expect(rowHeight).toBeLessThanOrEqual(56);
		await batting.focus();
		await page.keyboard.press('ArrowRight');
		await expect.poll(() => batting.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
		await batting.evaluate(node => node.scrollTo({ left: node.scrollWidth, behavior: 'instant' }));
		const finalCell = batting.locator('tbody tr').first().locator('td').last();
		// Season totals open sorted by estimated WAR, best first.
		const leader = sortLines(example.result.batting, BATTING_COLUMNS.find(column => column.key === 'war')!, 'descending')[0]!;
		await expect(finalCell).toHaveText(String(leader.SF));
		const endBox = (await finalCell.boundingBox())!;
		const regionBox = (await batting.boundingBox())!;
		expect(endBox.x + endBox.width).toBeLessThanOrEqual(regionBox.x + regionBox.width + 1);
		expect(Math.abs((await firstIdentity.boundingBox())!.x - initialLeft)).toBeLessThanOrEqual(1);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

		const lastGame = page.locator('#season-game-detail');
		await openGame(page, example.result.games.length - 1);
		const innings = lastGame.getByRole('region', { name: /inning line score/i });
		await innings.focus();
		await page.keyboard.press('ArrowRight');
		await expect.poll(() => innings.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
		await innings.evaluate(node => node.scrollTo({ left: node.scrollWidth, behavior: 'instant' }));
		await expect(innings.locator('tbody tr').first().locator('td').last()).toHaveText(String(example.result.games.at(-1)!.away.runs));
		await expect(lastGame.getByRole('region', { name: /batting box score/i }).first()).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

		await page.setViewportSize({ width: 1440, height: 900 });
		// The game opens under its week, and its month card widens to the calendar's full row.
		const listBox = (await page.locator('.season-calendar').boundingBox())!;
		const month = page.locator('.month:has(#season-game-detail)');
		expect((await month.boundingBox())!.width).toBeGreaterThanOrEqual(listBox.width - 1);
		expect((await lastGame.boundingBox())!.width).toBeGreaterThanOrEqual((await month.locator('.grid').boundingBox())!.width - 1);
		await expect(lastGame.locator('tbody th').first()).toBeVisible();
	});

	test('shows publication and publishing failure states', async ({ page }) => {
		await openStory(page, 'results-season--share-link');
		await expect(page.locator('#published-share-link')).toHaveValue(/example\.invalid/);
		await expect(page.locator('[data-toast]')).toContainText(/no upload/i);
		await openStory(page, 'results-season--share-unavailable');
		await expect(page.locator('[data-toast].error')).toContainText(/unavailable/i);
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
		await expect(page.locator('.card-review')).toBeVisible();
		await openStory(page, 'results-details--no-turning-points');
		await expect(page.getByText(/no positive win-expectancy swing/i)).toBeVisible();
		await expect(page.getByText(/no negative win-expectancy swing/i)).toBeVisible();
	});
});
