import { test, expect, openStory } from './workshop-test';

const card = (page: Parameters<typeof openStory>[0]) => page.locator('.card[data-face="front"]').first();

async function inlineTransform(page: Parameters<typeof openStory>[0]): Promise<string> {
	return card(page).evaluate(node => node.style.transform);
}

test.describe('Cards workshop', () => {
	test('responds to pointer and idle motion, then returns to the fixed pose when disabled', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openStory(page, 'cards-states--interactive');

		const interactive = card(page);
		await interactive.hover({ position: { x: 250, y: 320 } });
		await expect.poll(() => inlineTransform(page)).not.toBe('');
		await page.getByRole('switch', { name: 'Motion', exact: true }).click();
		await expect(page.getByRole('switch', { name: 'Motion', exact: true })).toHaveAttribute('aria-checked', 'false');
		await expect.poll(() => inlineTransform(page)).toBe('');
		await page.getByRole('switch', { name: 'Motion', exact: true }).click();
		await expect(page.getByRole('switch', { name: 'Motion', exact: true })).toHaveAttribute('aria-checked', 'true');

		await openStory(page, 'cards-motion--idle-drift');
		const firstFrame = await inlineTransform(page);
		await page.waitForTimeout(180);
		await expect.poll(() => inlineTransform(page)).not.toBe(firstFrame);
		await page.getByRole('switch', { name: 'Motion', exact: true }).click();
		await expect.poll(() => inlineTransform(page)).toBe('');
	});

	test('manager Controls render reactive era and finish arguments in the canvas', async ({ page }) => {
		await page.goto('/?path=/story/cards-states--interactive');
		const canvas = page.frameLocator('#storybook-preview-iframe');
		await expect(canvas.getByRole('button', { name: 'Reset story', exact: true })).toBeVisible();

		await page.locator('#control-era').selectOption('1950s');
		const rendered = canvas.locator('.card[data-card="1950s"][data-face="front"]').first();
		await expect(rendered).toBeVisible();
		await expect(rendered).toContainText('1955');

		await page.locator('#control-finish').selectOption('gem');
		await expect(rendered).toHaveAttribute('data-finish', 'gem');
		await page.locator('#control-width').press('End');
		await expect(rendered).toHaveJSProperty('clientWidth', 410);
	});

	test('keeps the 1980s badge border clear of gem edging', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/?path=/story/cards-states--missing-photo');
		await page.locator('#control-era').selectOption('1980s');
		await page.locator('#control-finish').selectOption('gem');
		const canvas = page.frameLocator('#storybook-preview-iframe');
		const rendered = canvas.locator('.card[data-card="1980s"][data-finish="gem"]').first();
		await expect(rendered).toBeVisible();
		for (const boundary of ['Home', 'End']) {
			await page.locator('#control-width').press(boundary);
			const clearance = await rendered.evaluate(root => {
				const badge = root.querySelector<HTMLElement>('[data-layer="logo.disc"]')!;
				const rim = root.querySelector<HTMLElement>('[data-layer="material.prism-ring"]')!;
				const badgeRect = badge.getBoundingClientRect(), rimRect = rim.getBoundingClientRect();
				const spread = Number.parseFloat(getComputedStyle(badge).boxShadow.match(/-?[\d.]+px/g)!.at(-1)!);
				return { left: badgeRect.left - spread - rimRect.left - Number.parseFloat(getComputedStyle(rim).paddingLeft),
					top: badgeRect.top - spread - rimRect.top - Number.parseFloat(getComputedStyle(rim).paddingTop) };
			});
			expect(clearance.left).toBeGreaterThanOrEqual(-.5);
			expect(clearance.top).toBeGreaterThanOrEqual(-.5);
		}
	});

	test('keeps illustrative photos matched to gallery identities and supports deliberate missing media', async ({ page }) => {
		await openStory(page, 'cards-states--era-samples');
		const photos = page.locator('.gallery [data-layer="photo.image"]');
		await expect(photos).toHaveCount(8);
		await expect.poll(() => photos.evaluateAll(nodes => nodes.every(node => {
			const image = node as HTMLImageElement;
			return image.complete && image.naturalWidth > 0 && image.src.startsWith('data:image/svg+xml,');
		}))).toBe(true);

		await openStory(page, 'cards-states--era-samples&args=missingPhoto:true');
		await expect(photos).toHaveCount(0);
		await expect(page.getByRole('img', { name: /no verified photo/i })).toHaveCount(8);
	});

	test('keeps flip faces semantically exclusive across replay and reset', async ({ page }) => {
		await openStory(page, 'interactions-cards--flip');
		const flip = page.locator('[data-cardbox]');
		const front = flip.locator('.front');
		const back = flip.locator('.back');

		await expect(flip).toHaveAttribute('data-face', 'front');
		await expect(front).toHaveAttribute('aria-hidden', 'false');
		await expect(back).toHaveAttribute('aria-hidden', 'true');
		await flip.getByRole('button', { name: 'Turn over', exact: true }).click();
		await expect(flip).toHaveAttribute('data-face', 'back');
		await expect(front).toHaveAttribute('inert', '');
		await expect(back).not.toHaveAttribute('inert', '');

		await expect.poll(() => flip.locator('[data-flip]').evaluate(node => node.style.transform)).toMatch(/rotateY\(180(?:\.00)?deg\)/);
		const settledPose = await flip.locator('[data-flip]').evaluate(node => node.style.transform);
		for (let replay = 0; replay < 2; replay += 1) {
			await page.getByRole('button', { name: 'Replay animation', exact: true }).click();
			await expect(flip).toHaveAttribute('data-face', 'back');
			await expect.poll(() => flip.locator('[data-flip]').evaluate(node => node.style.transform)).not.toBe(settledPose);
			await expect.poll(() => flip.locator('[data-flip]').evaluate(node => node.style.transform)).toBe(settledPose);
		}
		await page.getByRole('button', { name: 'Reset story', exact: true }).click();
		await expect(flip).toHaveAttribute('data-face', 'front');
	});

	for (const reducedMotion of ['no-preference', 'reduce'] as const) {
		test(`switches the same two-way back in place with ${reducedMotion} motion`, async ({ page }) => {
			await page.emulateMedia({ reducedMotion });
			await openStory(page, 'cards-states--two-way');
			const review = page.locator('.card-review');
			const flip = review.locator('[data-cardbox]');
			await review.getByRole('button', { name: 'Turn over', exact: true }).click();
			const toggle = review.getByRole('button', { name: 'Text version', exact: true });
			await toggle.scrollIntoViewIfNeeded();
			const backId = await toggle.getAttribute('aria-controls');
			const scrollBefore = await page.evaluate(() => window.scrollY);
			await toggle.click();
			await expect(toggle).toBeFocused();
			await expect(toggle).toHaveAttribute('aria-pressed', 'true');
			await expect(flip.locator('.back')).toHaveAttribute('id', backId!);
			await expect(flip.locator('.back .card')).toHaveCount(0);
			await expect(flip.locator('.back .inspection-back')).toHaveCount(1);
			await expect(review.getByRole('heading', { name: 'Batting', exact: true })).toBeVisible();
			await expect(review.getByRole('heading', { name: 'Pitching', exact: true })).toBeVisible();
			await expect(flip.locator('.front')).toHaveAttribute('inert', '');
			expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
			await toggle.click();
			await expect(toggle).toBeFocused();
			await expect(flip.locator('.back .inspection-back')).toHaveCount(0);
			await expect(flip.locator('.back .card[data-face="back"]')).toBeVisible();
			await review.getByRole('button', { name: 'Show front', exact: true }).click();
			await expect(flip.locator('.back')).toHaveAttribute('inert', '');
			await expect(flip.locator('.front')).not.toHaveAttribute('inert', '');
			await expect(page.getByRole('dialog')).toHaveCount(0);
		});
	}

	test('keeps gallery cards and large controlled cards inside narrow viewports', async ({ page }) => {
		for (const width of [320, 402, 820, 1440]) {
			await page.setViewportSize({ width, height: 900 });
			await openStory(page, 'cards-states--era-samples');
			await expect(page.locator('.gallery .card[data-card]')).toHaveCount(8);
			await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
		}
		await page.setViewportSize({ width: 320, height: 568 });
		await openStory(page, 'cards-states--interactive&args=width:410;finish:gem');
		await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
		const size = await card(page).evaluate(node => ({ width: node.clientWidth, height: node.clientHeight }));
		const availableWidth = await page.locator('.story-content').evaluate(node => node.clientWidth);
		expect(size.width).toBeLessThanOrEqual(availableWidth);
		expect(size.width / size.height).toBeCloseTo(5 / 7, 2);
	});
});

test.describe('Cards workshop with system reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('honors the system override while still exposing the flip back without 3D motion', async ({ page }) => {
		await openStory(page, 'cards-motion--idle-drift');
		await expect(page.locator('.workshop-controls > p[role="status"]').filter({ hasText: /system.*motion/i })).toBeVisible();
		await expect(page.getByRole('switch', { name: 'Motion', exact: true })).toBeDisabled();
		await expect.poll(() => inlineTransform(page)).toBe('');

		await openStory(page, 'interactions-cards--flip');
		const flip = page.locator('[data-cardbox]');
		await flip.getByRole('button', { name: 'Turn over', exact: true }).click();
		await expect(flip).toHaveAttribute('data-face', 'back');
		await expect(flip.locator('.front')).toHaveAttribute('inert', '');
		await expect(flip.locator('.back')).not.toHaveAttribute('inert', '');
		await expect(flip.locator('[data-flip]')).toHaveCSS('transform', 'none');
	});
});
