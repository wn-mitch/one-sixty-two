import type { Page } from '@playwright/test';
import { test, expect, openStory, openStoryByName } from './workshop-test';

const savedClubs = (page: Page) => page.getByRole('list', { name: 'Saved clubs' });
const tiles = (page: Page) => savedClubs(page).locator('button[data-entry]');
const tileShell = (page: Page, name: string) => savedClubs(page).locator('li').filter({ hasText: name }).first();

test('Team gallery sorts clubs and opens a club from the all-time leaders', async ({ page }) => {
	await openStoryByName(page, 'Modes/My teams', 'All-time leaders');
	await expect(tiles(page)).toHaveCount(3);
	const sortGroup = page.getByRole('group', { name: 'Sort clubs' });
	await expect(sortGroup.getByRole('button', { name: 'Most wins' })).toHaveAttribute('aria-pressed', 'true');
	// The retired memento has the most wins but is the oldest save.
	await expect(tiles(page).first()).toContainText('Last fall’s club');
	await sortGroup.getByRole('button', { name: 'Most recent' }).click();
	await expect(tiles(page).first()).toContainText('Example Aces');
	await expect(tiles(page).last()).toContainText('Last fall’s club');

	const leaders = page.getByRole('region', { name: 'All-time leaders' });
	await expect(leaders.getByRole('heading', { name: 'Wins', exact: true })).toHaveCount(0);
	const avg = leaders.locator('.board').filter({ has: page.getByRole('heading', { name: 'Batting average', exact: true }) });
	await expect(avg.getByRole('listitem')).toHaveCount(6);
	const row = await avg.getByRole('listitem').evaluateAll(items => items.map(item => item.getBoundingClientRect().toJSON()));
	expect(row.every(item => Math.abs(item.y - row[0]!.y) < 1 && item.width >= 44 && item.width <= 88)).toBe(true);
	await expect(leaders.getByRole('button', { name: /^Turn over / })).toHaveCount(0);
	const leader = avg.getByRole('listitem').last();
	const team = await leader.locator('.team').innerText();
	await leader.getByRole('button').click();
	await expect(leaders).toHaveCount(0);
	await expect(page.getByRole('region', { name: team, exact: true })).toBeVisible();
	await expect(tiles(page).and(page.locator('[aria-pressed="true"]'))).toHaveText(new RegExp(team));
});

test('Team gallery shows a club’s cards, lines, and history, and renames and deletes it', async ({ page }) => {
	await openStoryByName(page, 'Modes/My teams', 'Club');
	const club = page.getByRole('region', { name: 'Example Aces', exact: true });
	await expect(club.getByRole('list', { name: 'Roster' }).getByRole('listitem')).toHaveCount(16);
	await expect(club.locator('.roster .card [data-card]').first()).toBeVisible();
	await expect(club.getByRole('region', { name: 'Example Aces batting' }).locator('tbody tr')).toHaveCount(9);
	await expect(club.getByRole('region', { name: 'Example Aces pitching' }).locator('tbody tr')).toHaveCount(7);
	await expect(club.getByRole('link', { name: /^(Won|Lost) 3–[0-2] vs Example Rivals$|^(Won|Lost) [0-2]–3 vs Example Rivals$/ })).toHaveAttribute('href', /^\/h2h#a=/);
	await expect(club.getByRole('button', { name: 'Copy challenge link' })).toBeVisible();

	await club.getByRole('button', { name: 'Rename Example Aces' }).click();
	await club.getByLabel('Nickname').fill('Night Shift');
	await club.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('heading', { level: 2, name: 'Night Shift' })).toBeVisible();
	await expect(page.locator('[data-toast]')).toHaveText('Renamed to Night Shift.');
	await page.getByRole('button', { name: 'Delete Night Shift' }).click();
	await expect(tiles(page)).toHaveCount(2);
	await expect(page.getByRole('heading', { name: 'All-time leaders' })).toBeVisible();

	// A retired club keeps its stats but offers nothing that would replay it.
	await tiles(page).filter({ hasText: 'Last fall’s club' }).click();
	await expect(page.getByRole('region', { name: 'Last fall’s club' }).getByRole('button', { name: 'Copy challenge link' })).toHaveCount(0);
});

test('Team gallery compares decks through modifier selection or Head-to-head mode', async ({ page }) => {
	await openStoryByName(page, 'Modes/My teams', 'All-time leaders');
	await page.getByRole('group', { name: 'Sort clubs' }).getByRole('button', { name: 'Most recent' }).click();
	await tiles(page).nth(0).click();
	await tiles(page).nth(1).click({ modifiers: ['ControlOrMeta'] });
	const tape = page.getByRole('region', { name: /^Example Aces vs / });
	await expect(tape).toBeVisible();
	const meetings = tape.getByRole('row', { name: /Series won head-to-head/ });
	await expect(meetings.locator('td')).toHaveText(await tape.getByRole('link', { name: /won 3–/ }).first().innerText().then(text => text.startsWith('Example Aces') ? ['1', '0'] : ['0', '1']));
	await expect(tape.getByRole('link', { name: 'Play best-of-five' })).toHaveAttribute('href', /^\/h2h#a=.+&an=Example\+Aces&b=/);

	// A plain click inspects one club; Head-to-head builds pairs without a modifier key.
	await tiles(page).nth(0).click();
	await expect(page.getByRole('region', { name: 'Example Aces', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Head-to-head', exact: true }).click();
	await tiles(page).nth(2).click();
	const retiredTape = page.getByRole('region', { name: /^Example Aces vs Last fall’s club$/ });
	await expect(retiredTape).toBeVisible();
	await expect(retiredTape.getByRole('link', { name: 'Play best-of-five' })).toHaveCount(0);
	await expect(retiredTape).toContainText('A retired club can’t play head-to-head.');
});

test('Team cards retain grades for current and retired saves while flipping independently from selection', async ({ page }) => {
	await openStoryByName(page, 'Modes/My teams', 'All-time leaders');
	const current = tileShell(page, 'Example Aces');
	const retired = tileShell(page, 'Last fall’s club');
	const currentCard = current.locator('[data-card="club"]');
	const retiredCard = retired.locator('[data-card="club"]');
	await expect(currentCard).not.toHaveAttribute('data-grade', 'ungraded');
	await expect(retiredCard).toHaveAttribute('data-grade', 'D');
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	const bounds = (await currentCard.boundingBox())!;
	await page.mouse.move(bounds.x + bounds.width * .2, bounds.y + bounds.height * .3);
	await expect.poll(() => currentCard.evaluate(node => (node as HTMLElement).style.transform)).toContain('rotate');
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await expect.poll(() => currentCard.evaluate(node => (node as HTMLElement).style.transform)).toBe('');

	await current.locator('button[data-entry]').click();
	await expect(current.locator('button[data-entry]')).toHaveAttribute('aria-pressed', 'true');
	await current.getByRole('button', { name: 'Turn over Example Aces', exact: true }).click();
	await expect(current.locator('button[data-entry]')).toHaveAttribute('aria-pressed', 'true');
	await expect(current.locator('button[aria-label="Show front Example Aces"]')).toBeVisible();
	await expect(currentCard).toHaveAttribute('data-face', 'back');
	await current.getByRole('button', { name: 'Show front Example Aces', exact: true }).click();
	await expect(current.locator('button[data-entry]')).toHaveAttribute('aria-pressed', 'true');
	await expect(currentCard).toHaveAttribute('data-face', 'front');
	await retired.getByRole('button', { name: 'Turn over Last fall’s club', exact: true }).click();
	await expect(retiredCard).toHaveAttribute('data-face', 'back');
	await expect(retiredCard).toHaveAttribute('data-grade', 'D');
	await expect(retiredCard.locator('.back .roster-row')).toHaveCount(16);
	await expect(retiredCard.locator('.back .roster-row').last()).toBeVisible();
	await expect(current.locator('button[data-entry]')).toHaveAttribute('aria-pressed', 'true');
	await expect(retired.locator('button[data-entry]')).toHaveAttribute('aria-pressed', 'false');
});

test('Team card grade gallery compares all nine finishes and exposes the back through its story control', async ({ page }) => {
	await openStoryByName(page, 'Cards/Team cards', 'Nine-grade finishes');
	const gallery = page.getByRole('region', { name: 'Nine-grade team card preview' });
	const grades = ['F', 'D', 'C', 'B', 'A', 'AA', 'S', 'S+', 'Perfect'];
	await expect(gallery.locator('[data-card="club"]')).toHaveCount(grades.length);
	await expect(gallery.locator('[data-card="club"][data-face="front"]')).toHaveCount(grades.length);
	expect(await gallery.locator('[data-gallery-grade]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-gallery-grade')))).toEqual(grades);

	await page.getByRole('button', { name: 'Show backs', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Show backs', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(gallery.locator('[data-card="club"][data-face="back"]')).toHaveCount(grades.length);
});

test('unnamed team cards show the park once and format their winning percentage', async ({ page }) => {
	await openStoryByName(page, 'Modes/My teams', 'All-time leaders');
	const tile = tiles(page).filter({ hasNotText: 'Example Aces' }).filter({ hasNotText: 'Last fall’s club' });
	const front = tile.locator('.front');
	const record = (await front.locator('.record').innerText()).trim();
	const [wins, losses] = record.split('–').map(Number);
	const title = await front.locator('.title').innerText();
	expect(title).not.toContain(record);
	await expect(front.locator('.park')).toHaveCount(0);
	const winningPercentage = front.locator('.stat').filter({ has: page.getByText('Win %', { exact: true }) });
	await expect(winningPercentage.locator('.value')).toHaveText(`${(wins! / (wins! + losses!) * 100).toFixed(1)}%`);
	const differential = front.locator('.stat').filter({ has: page.getByText('Run differential', { exact: true }) });
	await expect(differential).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	for (const width of [390, 1512]) {
		await page.setViewportSize({ width, height: 844 });
		expect(await front.evaluate(node => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight)).toBe(true);
	}
});

test('Team gallery fits a phone without sideways scroll', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openStoryByName(page, 'Modes/My teams', 'Tale of the tape');
	await expect(page.getByRole('region', { name: /vs/ })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('Team gallery handles an empty or blocked library', async ({ page }) => {
	await openStoryByName(page, 'Modes/My teams', 'Empty');
	await expect(page.getByRole('link', { name: 'Build my team', exact: true })).toHaveAttribute('href', '/?build=1');
	await openStoryByName(page, 'Modes/My teams', 'Storage blocked');
	await expect(page.locator('[data-toast]')).toHaveText(/browser storage is blocked/);
});

test('Collection lists every rostered card and arranges a card’s stickers', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openStory(page, 'modes-collection--binder');
	await page.getByRole('button', { name: 'All seasons', exact: true }).click();
	const grid = page.getByRole('list', { name: 'Collected cards' });
	expect(await grid.getByRole('listitem').count()).toBeGreaterThanOrEqual(14);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	// Phones keep the binder's filters behind their toggle.
	await page.getByRole('button', { name: 'Filters' }).click();
	await page.getByLabel('With stickers').check();
	// Located by name: hiding its last sticker drops the card out of the With stickers filter.
	const name = await grid.getByRole('button').first().locator('.name').innerText();
	const stickered = grid.getByRole('button').filter({ has: page.locator('.name', { hasText: name }) }).first();
	await expect(stickered.locator('.stickers [data-family]').first()).toBeVisible();
	const face = stickered.locator('.stickers [data-family]');
	const before = await face.count();
	// A face holds the grade and at most three other stickers.
	expect(before).toBeLessThanOrEqual(4);
	await stickered.click();
	const detail = page.locator('section.detail');
	await detail.getByRole('button', { name: 'Edit stickers' }).click();
	await expect(detail.getByRole('button', { name: /^Move .* sticker/ })).toHaveCount(before);
	// Hiding a family takes it off the face; the next rarest visible family, if any, takes its place.
	const hidden = await detail.locator('.stickers li').filter({ has: page.getByRole('button', { name: 'Hide' }) }).first().locator('strong').innerText();
	await detail.getByRole('button', { name: 'Hide' }).first().click();
	await expect(stickered.getByRole('img', { name: new RegExp(hidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toHaveCount(0);
	const after = await face.count();
	expect(after).toBeGreaterThanOrEqual(before - 1);
	expect(after).toBeLessThanOrEqual(before);
	await expect(detail.getByRole('button', { name: /^Move .* sticker/ })).toHaveCount(after);
});

test('Collection groups cards by team or era with completion that leaves bullpens out', async ({ page }) => {
	await openStory(page, 'modes-collection--binder');
	await page.getByRole('button', { name: 'All seasons', exact: true }).click();
	const all = page.getByRole('list', { name: 'Collected cards' }).getByRole('listitem');
	await expect(all.first()).toBeVisible();
	const total = await all.count();
	// The example binder holds one team bullpen, which is collected but not counted.
	await page.locator('details.collection-status > summary').click();
	await expect(page.getByRole('meter', { name: 'Player-seasons' })).toHaveAttribute('value', String(total - 1));
	await page.getByRole('button', { name: 'Filters', exact: true }).click();
	for (const grouping of ['Team', 'Era']) {
		await page.getByLabel('Group').selectOption({ label: grouping });
		const shelves = page.locator('section.shelf');
		await expect(shelves.first().getByRole('heading')).toContainText(/\d+ of \d+ · [\d.]+%/);
		expect(await shelves.getByRole('listitem').count()).toBe(total);
	}
});

test('Collection explains an empty or blocked binder', async ({ page }) => {
	await openStory(page, 'modes-collection--empty');
	await expect(page.getByText(/Finish a season and every card on that roster joins your collection/)).toBeVisible();
	await openStory(page, 'modes-collection--storage-blocked');
	await expect(page.locator('[data-toast]')).toHaveText(/browser storage is blocked/);
});

test('head-to-head adds a replay opponent to a saved deck and plays the series', async ({ page }) => {
	await openStory(page, 'modes-head-to-head--saved-team-and-replay');
	await expect(page.getByRole('heading', { name: 'Example Aces', level: 2, exact: true })).toBeVisible();
	const replay = page.getByLabel('Team B replay link');
	await expect(replay).toHaveValue(/^https:\/\/example\.invalid\/r\/[0-9a-f]{64}$/);
	const link = await replay.inputValue();
	await page.locator('#team-b-name').fill('Example Challenger');
	await page.getByRole('button', { name: 'Use Team B replay', exact: true }).click();
	const opponent = page.getByRole('region', { name: 'Example Challenger', exact: true });
	await opponent.getByRole('button', { name: 'Change team', exact: true }).click();
	await expect(replay).toHaveValue(link);
	await expect(page.locator('#team-b-name')).toHaveValue('Example Challenger');
	await page.getByRole('button', { name: 'Use Team B replay', exact: true }).click();
	await page.getByRole('button', { name: 'Play best-of-five', exact: true }).click();

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
	await expect(page.getByRole('heading', { name: 'Replay challenge', level: 1 })).toBeVisible();
});

test('head-to-head cancellation restores the selected teams', async ({ page }) => {
	await openStory(page, 'modes-head-to-head--running');
	await expect(page.getByRole('button', { name: 'Play best-of-five', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Cancel series', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Change team', exact: true })).toHaveCount(2);
	await expect(page.getByRole('button', { name: 'Play best-of-five', exact: true })).toBeEnabled();
});

test('head-to-head results fit a phone without sideways scroll', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await openStory(page, 'modes-head-to-head--results');
	await expect(page.getByRole('heading', { level: 1, name: / win 3–[0-2]$/ })).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
