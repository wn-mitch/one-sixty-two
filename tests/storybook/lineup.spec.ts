import type { Locator, Page } from '@playwright/test';
import { expect, openStory, test } from './workshop-test.ts';

async function identities(list: Locator): Promise<string[]> {
	return list.locator(':scope > li').evaluateAll(rows => rows.map(row => row.getAttribute('data-season-id')!));
}

async function dragTo(page: Page, handle: Locator, target: Locator, after = true): Promise<void> {
	await handle.scrollIntoViewIfNeeded();
	const start = await handle.boundingBox();
	expect(start).not.toBeNull();
	await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
	await page.mouse.down();
	await target.scrollIntoViewIfNeeded();
	const end = await target.boundingBox();
	expect(end).not.toBeNull();
	await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height * (after ? .8 : .2), { steps: 8 });
}

test.describe('compact lineup editor', () => {
	test('renders all fourteen compact cards at 320px and retains native inspection', async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 800 });
		await openStory(page, 'lineup-editor--complete');
		const cards = page.locator('.lineup .miniature [data-compact="true"]');
		await expect(cards).toHaveCount(14);
		const widths = await cards.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
		expect(widths.every(width => width >= 72)).toBe(true);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
		const trigger = page.getByRole('button', { name: /^Inspect .* card$/ }).first();
		await trigger.click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(trigger).toBeFocused();
	});

	test('inserts a non-adjacent hitter, preserves identities and assignments, and retains keyboard ordering', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 1100 });
		await openStory(page, 'lineup-editor--complete');
		const list = page.locator('[data-order-kind="batting"]');
		const before = await identities(list);
		const assignments = await list.locator('select').evaluateAll(nodes => nodes.map(node => [node.closest('[data-roster-assignment]')!.getAttribute('data-roster-assignment'), node.value]));
		await dragTo(page, list.locator('.drag-handle').first(), list.locator('li').nth(3));
		await expect(list.locator('.insert-before')).toHaveCount(1);
		await expect(list.locator('li').first()).toHaveAttribute('data-season-id', before[0]);
		await page.mouse.up();
		await expect.poll(() => identities(list)).toEqual([...before.slice(1, 4), before[0], ...before.slice(4)]);
		await expect(page.locator('.announcement')).toContainText('moved to batting position 4');
		await expect(page.getByRole('dialog')).toHaveCount(0);
		const afterAssignments = await list.locator('select').evaluateAll(nodes => nodes.map(node => [node.closest('[data-roster-assignment]')!.getAttribute('data-roster-assignment'), node.value]));
		expect(afterAssignments.sort()).toEqual(assignments.sort());
		const up = list.locator('li').nth(3).getByRole('button', { name: /up in batting order/ });
		await up.focus();
		await page.keyboard.press('Enter');
		await expect(list.locator('li').nth(2)).toHaveAttribute('data-season-id', before[0]);
		await expect(page.locator('.announcement')).toContainText('moved to batting position 3');
	});

	test('cancels on Escape and rejects a batting-to-rotation drop', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 1100 });
		await openStory(page, 'lineup-editor--complete');
		const batting = page.locator('[data-order-kind="batting"]');
		const rotation = page.locator('[data-order-kind="starter"]');
		const batters = await identities(batting);
		const starters = await identities(rotation);
		await dragTo(page, batting.locator('.drag-handle').first(), batting.locator('li').nth(2));
		await page.keyboard.press('Escape');
		await page.mouse.up();
		expect(await identities(batting)).toEqual(batters);
		await expect(batting.locator('.drag-source')).toHaveCount(0);
		await dragTo(page, batting.locator('.drag-handle').first(), rotation.locator('li').nth(1));
		await page.mouse.up();
		expect(await identities(batting)).toEqual(batters);
		expect(await identities(rotation)).toEqual(starters);
		await expect(page.locator('.announcement')).toHaveText('');
	});

	test('reorders only the rotation and keeps closer and bullpen fixed', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 1100 });
		await openStory(page, 'lineup-editor--complete');
		const rotation = page.locator('[data-order-kind="starter"]');
		const before = await identities(rotation);
		const fixed = await page.locator('.fixed-player').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-season-id')));
		await dragTo(page, rotation.locator('.drag-handle').first(), rotation.locator('li').last());
		await page.mouse.up();
		await expect.poll(() => identities(rotation)).toEqual([before[1], before[2], before[0]]);
		expect(await page.locator('.fixed-player').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-season-id')))).toEqual(fixed);
		await expect(page.locator('.fixed-player .drag-handle')).toHaveCount(0);
	});

	test('blocks reorder and reassignment while busy', async ({ page }) => {
		await openStory(page, 'lineup-editor--busy');
		const handles = page.locator('.drag-handle');
		await expect(handles).toHaveCount(12);
		for (const handle of await handles.all()) await expect(handle).toBeDisabled();
		for (const control of await page.locator('.move, [data-assignment-select], [data-assignment-action]').all()) await expect(control).toBeDisabled();
		const list = page.locator('[data-order-kind="batting"]');
		const before = await identities(list);
		await handles.first().dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, button: 0, clientX: 10, clientY: 10 });
		await page.dispatchEvent('body', 'pointermove', { pointerId: 1, clientX: 10, clientY: 600 });
		await page.dispatchEvent('body', 'pointerup', { pointerId: 1, clientX: 10, clientY: 600 });
		expect(await identities(list)).toEqual(before);
		await expect(page.locator('.drag-source')).toHaveCount(0);
	});

	test('supports real touch dragging and touch cancellation without blocking page scrolling', async ({ page, browserName }) => {
		test.skip(browserName !== 'chromium', 'Native touch injection uses the Chromium input interface.');
		await page.setViewportSize({ width: 390, height: 1100 });
		await openStory(page, 'lineup-editor--complete');
		const client = await page.context().newCDPSession(page);
		const list = page.locator('[data-order-kind="batting"]');
		const before = await identities(list);
		const handle = list.locator('.drag-handle').first();
		await handle.scrollIntoViewIfNeeded();
		const start = (await handle.boundingBox())!;
		const target = (await list.locator('li').nth(1).boundingBox())!;
		const from = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
		const to = { x: target.x + target.width / 2, y: target.y + target.height * .8 };
		await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
		await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] });
		await expect(list.locator('.drag-source')).toHaveCount(1);
		await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
		expect(await identities(list)).toEqual(before);
		await expect(list.locator('.drag-source')).toHaveCount(0);
		await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
		await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] });
		await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await expect.poll(() => identities(list)).toEqual([before[1], before[0], ...before.slice(2)]);
		await expect(page.getByRole('dialog')).toHaveCount(0);
		const scrollBefore = await page.evaluate(() => window.scrollY);
		await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 20, y: 850 }] });
		for (const y of [750, 650, 550, 450]) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 20, y }] });
		await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore);
		await client.detach();
	});
});
