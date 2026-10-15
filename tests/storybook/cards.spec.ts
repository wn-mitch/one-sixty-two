import { test, expect, openStory, openStoryByName } from './workshop-test';

const card = (page: Parameters<typeof openStory>[0]) => page.locator('.card[data-face="front"]').first();

async function inlineTransform(page: Parameters<typeof openStory>[0]): Promise<string> {
	return card(page).evaluate(node => node.style.transform);
}

test.describe('Cards workshop', () => {
	test('responds to pointer and idle motion; Motion stops pointer tilt, and only reduced motion stops idle drift', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openStory(page, 'cards-states--interactive');

		const interactive = card(page);
		await interactive.hover({ position: { x: 250, y: 320 } });
		await expect.poll(() => inlineTransform(page)).not.toBe('');
		await page.getByRole('button', { name: 'Settings', exact: true }).click();
		let settings = page.getByRole('dialog', { name: 'Settings', exact: true });
		await settings.getByRole('switch', { name: 'Motion', exact: true }).click();
		await settings.getByRole('button', { name: 'Close settings', exact: true }).click();
		// Hold idle drift with the pointer; Motion off must leave this hovered face untilted.
		const bounds = (await interactive.boundingBox())!;
		await page.mouse.move(bounds.x + bounds.width * 0.8, bounds.y + bounds.height * 0.7);
		await expect.poll(() => inlineTransform(page)).toBe('');
		await page.getByRole('button', { name: 'Settings', exact: true }).click();
		settings = page.getByRole('dialog', { name: 'Settings', exact: true });
		await settings.getByRole('switch', { name: 'Motion', exact: true }).click();
		await settings.getByRole('button', { name: 'Close settings', exact: true }).click();

		await openStory(page, 'cards-motion--idle-drift');
		const firstFrame = await inlineTransform(page);
		await page.waitForTimeout(180);
		await expect.poll(() => inlineTransform(page)).not.toBe(firstFrame);
		await page.getByRole('button', { name: 'Settings', exact: true }).click();
		await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('switch', { name: 'Motion', exact: true }).click();
		await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'Close settings', exact: true }).click();
		// Passive drift keeps running with the Motion setting off.
		const offFrame = await inlineTransform(page);
		await page.waitForTimeout(180);
		await expect.poll(() => inlineTransform(page)).not.toBe(offFrame);
		await page.emulateMedia({ reducedMotion: 'reduce' });
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

	test('a lit card leaves its finish to the light canvas and keeps the tagged shapes it reads', async ({ page }) => {
		await page.goto('/?path=/story/cards-states--interactive');
		await page.locator('#control-finish').selectOption('emboss');
		const canvas = page.frameLocator('#storybook-preview-iframe');
		const rendered = canvas.locator('.card[data-finish="emboss"][data-face="front"]').first();
		await expect(rendered).toHaveAttribute('data-shaded', 'true');
		// The canvas fades in once it has drawn, so the card never sits under an empty light layer.
		await expect(rendered.locator('canvas.light')).toHaveAttribute('data-presented', '', { timeout: 15000 });
		const finish = await rendered.evaluate(root => {
			const layers = [...root.querySelectorAll<HTMLElement>('[data-layer="material"] [data-layer]')];
			return {
				untagged: layers.filter(layer => !layer.dataset.surface).map(layer => layer.dataset.layer),
				painted: layers.filter(layer => getComputedStyle(layer).backgroundImage !== 'none').map(layer => layer.dataset.layer),
				rings: root.querySelectorAll('[data-layer="material.gold-ring"][data-surface="ring"]').length,
				stamp: getComputedStyle(root).getPropertyValue('--stamp').trim(),
				bevels: [...root.querySelectorAll<HTMLElement>('[data-layer="material.photo-bevel"]')].filter(bevel => getComputedStyle(bevel).display !== 'none').length
			};
		});
		expect(finish).toEqual({ untagged: [], painted: [], rings: 1, stamp: '', bevels: 0 });
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
		// Isolate the card's flight from the separate surface tilt, including idle drift.
		await page.addStyleTag({ content: '.front .card { transform: none !important; }' });
		const flip = page.locator('[data-cardbox]');
		const front = flip.locator('.front');
		const back = flip.locator('.back');

		await expect(flip).toHaveAttribute('data-face', 'front');
		await expect(front).toHaveAttribute('aria-hidden', 'false');
		await expect(back).toHaveAttribute('aria-hidden', 'true');
		const turn = flip.getByRole('button', { name: 'Turn over', exact: true });
		await turn.scrollIntoViewIfNeeded();
		const sourceRect = await flip.locator('.front .card').evaluate(node => {
			const rect = node.getBoundingClientRect();
			return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
		});
		const firstFrame = await turn.evaluate(async button => {
			button.focus({ preventScroll: true });
			button.click();
			const frame = Promise.withResolvers<number>();
			requestAnimationFrame(frame.resolve);
			await frame.promise;
			const rect = button.closest('[data-cardbox]')!.querySelector('.front .card')!.getBoundingClientRect();
			return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
		});
		for (const dimension of ['x', 'y', 'width', 'height'] as const) {
			expect(Math.abs(firstFrame[dimension] - sourceRect[dimension])).toBeLessThan(3);
		}
		await expect(flip).toHaveAttribute('data-face', 'back');
		await expect(front).toHaveAttribute('inert', '');
		await expect(back).not.toHaveAttribute('inert', '');
		// Side by side both faces show, so the reader takes focus and offers no turn button.
		await expect(flip.locator('[data-card-reader]')).toBeFocused();
		await expect(flip.getByRole('button', { name: 'Show front', exact: true })).toHaveCount(0);

		await expect.poll(() => flip.locator('[data-flip]').evaluate(node => node.style.transform)).toMatch(/rotateY\(180(?:\.00)?deg\)/);
		const readerRect = await flip.locator('[data-flip]').evaluate(node => {
			const rect = node.getBoundingClientRect();
			// Wide screens raise the front beside the back; the pair is what centers.
			const companion = node.closest('[data-card-reader]')!.querySelector('[data-card-companion]')?.getBoundingClientRect();
			return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, left: companion?.left ?? rect.left, viewportWidth: innerWidth, viewportHeight: innerHeight };
		});
		await expect(flip.locator('[data-card-companion]')).toHaveCount(1);
		expect(Math.abs((readerRect.left + readerRect.x + readerRect.width) / 2 - readerRect.viewportWidth / 2)).toBeLessThan(3);
		expect(Math.abs(readerRect.y + readerRect.height / 2 - readerRect.viewportHeight / 2)).toBeLessThan(3);
		const settledPose = await flip.locator('[data-flip]').evaluate(node => node.style.transform);
		for (let replay = 0; replay < 2; replay += 1) {
			await page.getByRole('button', { name: 'Replay animation', exact: true }).click();
			await expect(flip).toHaveAttribute('data-face', 'back');
			await expect.poll(() => flip.locator('[data-flip]').evaluate(node => node.style.transform)).not.toBe(settledPose);
			await expect.poll(() => flip.locator('[data-flip]').evaluate(node => node.style.transform)).toBe(settledPose);
		}
		await flip.locator('[data-card-reader] .back').click({ position: { x: 20, y: 8 } });
		await expect(flip).toHaveAttribute('data-face', 'front');
		await expect.poll(() => flip.locator('[data-flip]').evaluate(node => node.style.transform)).toMatch(/rotateY\(0(?:\.00)?deg\)/);
		const returnedRect = await flip.locator('.front .card').evaluate(node => {
			const rect = node.getBoundingClientRect();
			return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
		});
		for (const dimension of ['x', 'y', 'width', 'height'] as const) {
			expect(Math.abs(returnedRect[dimension] - sourceRect[dimension])).toBeLessThan(1);
		}
		await expect(turn).toBeFocused();
		await page.getByRole('button', { name: 'Reset story', exact: true }).click();
		await expect(flip).toHaveAttribute('data-face', 'front');
	});

	test('opens season evidence in the text back instead of a separate details panel', async ({ page }) => {
		await openStory(page, 'cards-states--interactive');
		const review = page.locator('.card-review');
		await review.getByRole('button', { name: 'Turn over', exact: true }).click();
		await review.getByRole('button', { name: /^Show text version for / }).click();
		const text = review.getByRole('region', { name: 'Historical season text version', exact: true });
		await expect(text).toBeVisible();
		await expect(review.getByRole('button', { name: 'Text version', exact: true })).toBeFocused();
		await expect(text.getByRole('heading', { name: 'Statistics source', exact: true })).toBeVisible();
		await expect(text.getByRole('link', { name: 'CC0 1.0', exact: true }).first()).toHaveAttribute('href', 'https://creativecommons.org/publicdomain/zero/1.0/');
		await expect(text.getByRole('region', { name: 'Pre-season estimates', exact: true })).toHaveCount(0);
		await expect(review.getByRole('button', { name: 'Details', exact: true })).toHaveCount(0);
		await review.getByRole('button', { name: 'Text version', exact: true }).click();
		await expect(review.locator('.back .card[data-face="back"]')).toBeVisible();
	});

	for (const reducedMotion of ['no-preference', 'reduce'] as const) {
		test(`switches the same two-way back in place with ${reducedMotion} motion`, async ({ page }) => {
			await page.emulateMedia({ reducedMotion });
			await openStory(page, 'cards-states--two-way');
			const review = page.locator('.card-review');
			const flip = review.locator('[data-cardbox]');
			await review.getByRole('button', { name: 'Turn over', exact: true }).click();
			const backId = await flip.locator('.back').getAttribute('id');
			const scrollBefore = await page.evaluate(() => window.scrollY);
			await review.getByRole('button', { name: /^Show text version for / }).click();
			const toggle = review.getByRole('button', { name: 'Text version', exact: true });
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
			await expect(review.getByRole('button', { name: /^Show text version for / })).toBeFocused();
			await expect(flip.locator('.back .inspection-back')).toHaveCount(0);
			await expect(flip.locator('.back .card[data-face="back"]')).toBeVisible();
			await page.keyboard.press('Escape');
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

	for (const film of ['penrose', 'pinwheel', 'poincare-disk', 'apollonian', 'gosper']) {
		test(`${film} renders its holo and changes the rendered light with tilt`, async ({ page }) => {
			await openStoryByName(page, 'Workshop/Films', film);
			const face = page.locator('.lab .card').first();
			const canvas = face.locator('canvas.light');
			await expect(canvas).toHaveAttribute('data-presented', '', { timeout: 15000 });
			const box = (await face.boundingBox())!;
			await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
			await expect.poll(() => face.evaluate(node => node.style.transform)).toContain('rotate');
			const first = await canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL());
			await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7);
			await expect.poll(() => canvas.evaluate(node => (node as HTMLCanvasElement).toDataURL()))
				.not.toBe(first);
		});
	}

	test('the finish gallery picks each era\'s holo film and foil plate on its own', async ({ page }) => {
		await openStoryByName(page, 'Cards/Finish gallery', 'All eras');
		const cards = (era: string) => page.locator(`.card[data-card="${era}"]`);
		await expect(cards('1980s')).toHaveCount(4, { timeout: 15000 });
		const otherPlate = await cards('1990s').first().getAttribute('data-plate');
		const ownFilm = await cards('1980s').first().getAttribute('data-film');
		const root = page.locator('.dialkit-root');
		await root.getByRole('button', { name: 'Finish gallery', exact: true }).press('Enter');
		await root.getByRole('button', { name: 'Eras', exact: true }).press('Enter');
		await root.getByRole('button', { name: '1980s', exact: true }).press('Enter');
		// Every era folder has a Plate picker, in era order; the 1980s is the fourth.
		await root.getByRole('button', { name: /^Plate / }).nth(3).click();
		await page.getByRole('listbox', { name: 'Plate', exact: true }).getByRole('option', { name: 'Knurl', exact: true }).click();
		for (const card of await cards('1980s').all()) await expect(card).toHaveAttribute('data-plate', 'knurl');
		// Only that era changes.
		await expect(cards('1990s').first()).toHaveAttribute('data-plate', otherPlate!);
		await expect(cards('1980s').first()).toHaveAttribute('data-film', ownFilm!);
	});

	test('the foil gallery renders pressed patterns distinctly from brushed grain', async ({ page }) => {
		await page.setViewportSize({ width: 2400, height: 2600 });
		await openStory(page, 'cards-foil-gallery--all-plates');
		// The pinstripe tile belongs to no era, so without the per-card override it would press its fallback 1960s brushed grain.
		const edges = async (plate: string) => {
			const tile = page.locator(`.card[data-finish="foil"][data-plate="${plate}"]`);
			await tile.evaluate(node => node.scrollIntoView({ block: 'center' }));
			await expect(tile.locator('canvas.light')).toHaveAttribute('data-presented', '', { timeout: 15000 });
			await expect(tile.locator('canvas.light')).toHaveCSS('opacity', '1');
			const png = await page.screenshot({ clip: (await tile.boundingBox())! });
			return page.evaluate(async source => {
				const image = new Image();
				image.src = `data:image/png;base64,${source}`;
				await image.decode();
				const canvas = new OffscreenCanvas(image.width, image.height);
				const context = canvas.getContext('2d')!;
				context.drawImage(image, 0, 0);
				const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
				let jumps = 0;
				for (let y = height * 0.1 | 0; y < height * 0.9; y++) for (let x = width * 0.1 | 0; x < width * 0.9; x++) {
					const i = (y * width + x) * 4;
					// Across a row: brushed grain runs along the row, so only a pressed pattern jumps here.
					if (Math.abs(data[i]! - data[i + 4]!) > 24) jumps++;
				}
				return jumps;
			}, png.toString('base64'));
		};
		expect(await edges('pinstripe')).toBeGreaterThan(2 * await edges('brushed'));
	});
});

test.describe('Cards workshop with system reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('honors the system override while still exposing the flip back without 3D motion', async ({ page }) => {
		await openStory(page, 'cards-motion--idle-drift');
		await page.getByRole('button', { name: 'Settings', exact: true }).click();
		const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
		await expect(settings.getByRole('status').filter({ hasText: 'system preference reduces motion' })).toBeVisible();
		await expect(settings.getByRole('switch', { name: 'Motion', exact: true })).toBeDisabled();
		await settings.getByRole('button', { name: 'Close settings', exact: true }).click();
		await expect.poll(() => inlineTransform(page)).toBe('');

		await openStory(page, 'interactions-cards--flip');
		const flip = page.locator('[data-cardbox]');
		await flip.getByRole('button', { name: 'Turn over', exact: true }).click();
		await expect(flip).toHaveAttribute('data-face', 'back');
		await expect(flip.locator('.front')).toHaveAttribute('inert', '');
		await expect(flip.locator('.back')).not.toHaveAttribute('inert', '');
		await expect(flip.locator('[data-flip]')).toHaveCSS('transform', 'none');
		const readerRect = await flip.locator('[data-flip]').evaluate(node => {
			const rect = node.getBoundingClientRect();
			// Wide screens raise the front beside the back; the pair is what centers.
			const companion = node.closest('[data-card-reader]')!.querySelector('[data-card-companion]')?.getBoundingClientRect();
			return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, left: companion?.left ?? rect.left, viewportWidth: innerWidth, viewportHeight: innerHeight };
		});
		await expect(flip.locator('[data-card-companion]')).toHaveCount(1);
		expect(Math.abs((readerRect.left + readerRect.x + readerRect.width) / 2 - readerRect.viewportWidth / 2)).toBeLessThan(3);
		expect(Math.abs(readerRect.y + readerRect.height / 2 - readerRect.viewportHeight / 2)).toBeLessThan(3);
	});
});
