import type { Page } from '@playwright/test';
import { test, expect, openStory } from './workshop-test';

const tiles = (page: Page) => page.getByRole('list', { name: 'Saved clubs' }).getByRole('button');

test('My seasons sorts clubs and opens a club from the all-time leaders', async ({ page }) => {
	await openStory(page, 'modes-my-seasons--leaders');
	await expect(tiles(page)).toHaveCount(3);
	const sortGroup = page.getByRole('group', { name: 'Sort clubs' });
	await expect(sortGroup.getByRole('button', { name: 'Most wins' })).toHaveAttribute('aria-pressed', 'true');
	// The retired memento has the most wins but is the oldest save.
	await expect(tiles(page).first()).toContainText('Last fall’s club');
	await sortGroup.getByRole('button', { name: 'Most recent' }).click();
	await expect(tiles(page).first()).toContainText('Example Aces');
	await expect(tiles(page).last()).toContainText('Last fall’s club');

	const leaders = page.getByRole('region', { name: 'All-time leaders' });
	const wins = leaders.locator('.board').filter({ has: page.getByRole('heading', { name: 'Wins', exact: true }) });
	await expect(wins.getByRole('listitem').first()).toContainText('Last fall’s club');
	await expect(wins.getByRole('listitem').first()).toContainText('112');
	const avg = leaders.locator('.board').filter({ has: page.getByRole('heading', { name: 'Batting average', exact: true }) });
	await expect(avg.getByRole('listitem')).toHaveCount(5);
	const leader = avg.getByRole('listitem').first();
	const team = await leader.locator('.team').innerText();
	await leader.getByRole('button').click();
	await expect(leaders).toHaveCount(0);
	await expect(page.getByRole('region', { name: team, exact: true })).toBeVisible();
	await expect(tiles(page).and(page.locator('[aria-pressed="true"]'))).toHaveText(new RegExp(team));
});

test('My seasons shows a club’s cards, lines, and history, and renames and deletes it', async ({ page }) => {
	await openStory(page, 'modes-my-seasons--club');
	const club = page.getByRole('region', { name: 'Example Aces', exact: true });
	await expect(club.getByRole('list', { name: 'Roster' }).getByRole('listitem')).toHaveCount(14);
	await expect(club.locator('.roster .card [data-card]').first()).toBeVisible();
	await expect(club.getByRole('region', { name: 'Example Aces batting' }).locator('tbody tr')).toHaveCount(9);
	await expect(club.getByRole('region', { name: 'Example Aces pitching' }).locator('tbody tr')).toHaveCount(4);
	await expect(club.getByRole('link', { name: /^(Won|Lost) 3–[0-2] vs Example Rivals$|^(Won|Lost) [0-2]–3 vs Example Rivals$/ })).toHaveAttribute('href', /^\/h2h#a=/);
	await expect(club.getByRole('button', { name: 'Copy challenge link' })).toBeVisible();

	await club.getByRole('button', { name: 'Rename Example Aces' }).click();
	await club.getByLabel('Nickname').fill('Night Shift');
	await club.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('heading', { level: 2, name: 'Night Shift' })).toBeVisible();
	await expect(page.getByRole('status')).toHaveText('Renamed to Night Shift.');
	await page.getByRole('button', { name: 'Delete Night Shift' }).click();
	await expect(tiles(page)).toHaveCount(2);
	await expect(page.getByRole('heading', { name: 'All-time leaders' })).toBeVisible();

	// A retired club keeps its stats but offers nothing that would replay it.
	await tiles(page).filter({ hasText: 'Last fall’s club' }).click();
	await expect(page.getByRole('region', { name: 'Last fall’s club' }).getByRole('button', { name: 'Copy challenge link' })).toHaveCount(0);
});

test('My seasons compares two clubs by Ctrl/Cmd-click or the Compare toggle', async ({ page }) => {
	await openStory(page, 'modes-my-seasons--leaders');
	await page.getByRole('group', { name: 'Sort clubs' }).getByRole('button', { name: 'Most recent' }).click();
	await tiles(page).nth(0).click();
	await tiles(page).nth(1).click({ modifiers: ['ControlOrMeta'] });
	const tape = page.getByRole('region', { name: /^Example Aces vs / });
	await expect(tape).toBeVisible();
	const meetings = tape.getByRole('row', { name: /Series won head-to-head/ });
	await expect(meetings.locator('td')).toHaveText(await tape.getByRole('link', { name: /won 3–/ }).first().innerText().then(text => text.startsWith('Example Aces') ? ['1', '0'] : ['0', '1']));
	await expect(tape.getByRole('link', { name: 'Play best-of-five' })).toHaveAttribute('href', /^\/h2h#a=.+&an=Example\+Aces&b=/);

	// A plain click goes back to one club; the Compare toggle builds pairs without a modifier key.
	await tiles(page).nth(0).click();
	await expect(page.getByRole('region', { name: 'Example Aces', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Compare', exact: true }).click();
	await tiles(page).nth(2).click();
	const retiredTape = page.getByRole('region', { name: /^Example Aces vs Last fall’s club$/ });
	await expect(retiredTape).toBeVisible();
	await expect(retiredTape.getByRole('link', { name: 'Play best-of-five' })).toHaveCount(0);
	await expect(retiredTape).toContainText('A retired club can’t play head-to-head.');
});

test('My seasons fits a phone without sideways scroll', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openStory(page, 'modes-my-seasons--compare');
	await expect(page.getByRole('region', { name: /vs/ })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('My seasons explains an empty or blocked library', async ({ page }) => {
	await openStory(page, 'modes-my-seasons--empty');
	await expect(page.getByText('Finish a season and it is saved here')).toBeVisible();
	await openStory(page, 'modes-my-seasons--storage-blocked');
	await expect(page.getByRole('status')).toHaveText(/browser storage is blocked/);
});

test('head-to-head validates links, fills from saved seasons, and plays the series', async ({ page }) => {
	await openStory(page, 'modes-head-to-head--from-my-seasons');
	const play = page.getByRole('button', { name: 'Play best-of-five', exact: true });
	await play.click();
	await expect(page.getByLabel('Team A replay link')).toHaveAttribute('aria-invalid', 'true');
	await expect(page.locator('#team-a-error')).toHaveText('Paste a replay link.');

	await page.getByLabel('Choose from my seasons').first().selectOption({ index: 1 });
	await expect(page.getByLabel('Team A replay link')).toHaveValue(/^https:\/\/example\.invalid\/r\/[0-9a-f]{64}$/);
	await expect(page.locator('#team-a-name')).toHaveValue('Example Aces');
	await expect(page.locator('#team-a-error')).toHaveCount(0);
	// Retired mementos cannot play, so only the two playable clubs are offered.
	await expect(page.getByLabel('Choose from my seasons').nth(1).locator('option')).toHaveCount(3);
	await page.getByLabel('Choose from my seasons').nth(1).selectOption({ index: 2 });
	await expect(page.getByLabel('Team B replay link')).toHaveValue(/^https:\/\/example\.invalid\/r\/[0-9a-f]{64}$/);
	expect(await page.getByLabel('Team B replay link').inputValue()).not.toBe(await page.getByLabel('Team A replay link').inputValue());
	await play.click();

	const verdict = page.getByRole('heading', { level: 1, name: / win 3–[0-2]$/ });
	await expect(verdict).toBeVisible();
	await expect(page.getByRole('region', { name: 'Series line score' }).locator('tbody tr')).toHaveCount(2);
	const titles = await page.getByRole('region', { name: 'Series superlatives' }).locator('.award-title').allTextContents();
	expect(titles[0]).toBe('Top bat');
	expect(titles).toContain('Ace');
	expect(titles.at(-1)).toBe('LVP');
	const swings = page.getByRole('region', { name: 'Series swings' });
	await expect(swings.getByRole('img', { name: /^Game 1: / })).toBeVisible();
	const pin = swings.getByRole('button', { name: /^Swing 1: biggest lift for / });
	await pin.click();
	await expect(page.locator('#series-swing-1')).toHaveClass(/active/);
	const games = page.getByRole('region', { name: 'Box scores' }).getByRole('article');
	expect(await games.count()).toBeGreaterThanOrEqual(3);
	await expect(games.first().getByRole('region', { name: 'Game 1 inning line score' })).toBeVisible();
	await expect(games.first().locator('tbody th[scope=row]').first()).not.toBeEmpty();
	// Batting and pitching boxes wait behind each game's disclosure.
	const boxes = games.first().locator('details.boxes');
	await expect(boxes).not.toHaveAttribute('open');
	await boxes.getByText('Batting and pitching', { exact: true }).click();
	await expect(boxes.getByRole('table').first()).toBeVisible();
	await page.getByRole('button', { name: 'Play another series', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Head-to-head', level: 1 })).toBeVisible();
});

test('head-to-head shows run progress and lets the series be cancelled', async ({ page }) => {
	await openStory(page, 'modes-head-to-head--running');
	await expect(page.getByRole('status')).toContainText('Team A season 118/162 · Team B season 96/162');
	await expect(page.getByRole('button', { name: 'Play best-of-five', exact: true })).toBeDisabled();
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText('Series cancelled.');
	await expect(page.getByRole('button', { name: 'Play best-of-five', exact: true })).toBeEnabled();
});

test('head-to-head results fit a phone without sideways scroll', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openStory(page, 'modes-head-to-head--results');
	await expect(page.getByRole('heading', { level: 1, name: / win 3–[0-2]$/ })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
