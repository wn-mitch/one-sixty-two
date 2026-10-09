import type { Page } from '@playwright/test';
import { test, expect, openStory, openStoryByName } from './workshop-test';

async function candidateGroups(page: Page): Promise<string[]> {
	return page.locator('.candidate-card[data-candidate-group]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-candidate-group')!));
}

function candidate(page: Page, number: string) {
	return page.locator(`.candidate-card[data-candidate-group="candidate-${number}"]`);
}

async function openChoosing(page: Page, args = ''): Promise<void> {
	await openStory(page, `draft-board--choosing${args}`);
	await expect(page.locator('.candidates')).toBeVisible();
}

test.describe('Draft board browsing', () => {
	test('keeps loading cards readable and honors live reduced motion', async ({ page }) => {
		await openStory(page, 'draft-board--loading');
		await expect(page.getByRole('status', { name: 'Loading available player seasons' })).toBeVisible();
		await expect(page.locator('.loading-card.flying')).toBeVisible({ timeout: 6000 });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await expect(page.locator('.loading-card.flying')).toHaveCount(0);
		for (const width of [320, 1100, 1440]) {
			await page.setViewportSize({ width, height: 900 });
			await page.evaluate(() => document.fonts.ready);
			await expect.poll(() => page.locator('.loading-cards').evaluate(root => root.getAnimations({ subtree: true }).length)).toBe(0);
			const layout = await page.locator('.loading-cards').evaluate(root => ({
				overflow: document.documentElement.scrollWidth > innerWidth,
				labelsFit: [...root.querySelectorAll('.team-word')].every(label => {
					const range = document.createRange();
					range.selectNodeContents(label);
					const text = range.getBoundingClientRect();
					const card = label.closest('.loading-card')!.getBoundingClientRect();
					return text.left >= card.left && text.right <= card.right;
				})
			}));
			expect(layout).toEqual({ overflow: false, labelsFit: true });
		}
		await expect(page.locator('.picked-count')).toContainText('0 / 14');
	});

	test('returns a partly covered card without a scrollbar landing jump', async ({ page }) => {
		await page.setViewportSize({ width: 1212, height: 788 });
		await openChoosing(page);
		await page.addStyleTag({ content: 'html { scrollbar-gutter: stable; }' });
		await page.addStyleTag({ content: '.candidate-card .front > .card { transform: none !important; }' });
		const card = page.locator('.candidate-card').first();
		await card.getByRole('button', { name: /^Preview .+ at 2B$/ }).click();
		const original = await card.evaluate(async root => {
			await document.fonts.ready;
			const source = root.querySelector('.front .card')!;
			scrollTo(0, scrollY + source.getBoundingClientRect().top - 20);
			const rect = source.getBoundingClientRect();
			return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
		});
		expect(original.y).toBeLessThan(await page.locator('.draft-header').evaluate(node => node.getBoundingClientRect().bottom));
		const first = await card.getByRole('button', { name: 'Turn over', exact: true }).evaluate(async button => {
			button.focus({ preventScroll: true });
			button.click();
			const frame = Promise.withResolvers<void>();
			requestAnimationFrame(() => frame.resolve());
			await frame.promise;
			const rect = button.closest('.candidate-card')!.querySelector('.front .card')!.getBoundingClientRect();
			return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
		});
		await expect.poll(() => card.locator('[data-flip]').evaluate(node => node.style.transform)).toMatch(/rotateY\(180(?:\.00)?deg\)/);
		const landing = await card.evaluate(async root => {
			const reader = root.querySelector<HTMLElement>('[data-card-reader]')!;
			const source = root.querySelector('.front .card')!;
			const rect = () => {
				const bounds = source.getBoundingClientRect();
				return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
			};
			reader.querySelector<HTMLButtonElement>('.reader-return')!.click();
			const finished = Promise.withResolvers<void>();
			let last = rect();
			const sample = () => {
				if (reader.matches(':popover-open')) {
					last = rect();
					requestAnimationFrame(sample);
				} else finished.resolve();
			};
			requestAnimationFrame(sample);
			await finished.promise;
			return { last, returned: rect() };
		});
		for (const frame of [first, landing.last, landing.returned]) {
			for (const dimension of ['x', 'y', 'width', 'height'] as const) {
				expect(Math.abs(frame[dimension] - original[dimension])).toBeLessThan(1);
			}
		}
		await expect(card.getByRole('button', { name: 'Turn over', exact: true })).toBeFocused();
	});

	test('opening another card returns the previous reader', async ({ page }) => {
		await page.setViewportSize({ width: 1212, height: 788 });
		await openChoosing(page);
		const first = page.locator('.candidate-card').first();
		const next = page.locator('.candidate-card').nth(5);
		await first.getByRole('button', { name: 'Turn over', exact: true }).click();
		await expect(first.getByRole('button', { name: 'Show front', exact: true })).toBeFocused();
		const turnNext = next.getByRole('button', { name: 'Turn over', exact: true });
		await turnNext.evaluate(button => scrollTo(0, scrollY + button.getBoundingClientRect().top - (innerHeight - 48)));
		await turnNext.click();
		await expect(first.locator('[data-cardbox]')).toHaveAttribute('data-face', 'front');
		await expect(next.locator('[data-cardbox]')).toHaveAttribute('data-face', 'back');
		await expect(page.locator('[data-card-reader]:popover-open')).toHaveCount(1);
		await expect(next.getByRole('button', { name: 'Show front', exact: true })).toBeFocused();
		await next.getByRole('button', { name: 'Show front', exact: true }).click();
		await expect(page.locator('[data-card-reader]:popover-open')).toHaveCount(0);
		await expect(turnNext).toBeFocused();
	});

	test('fits the compact field and readable franchise controls at desktop sizes', async ({ page }) => {
		await page.setViewportSize({ width: 1212, height: 788 });
		await openChoosing(page);
		await page.evaluate(() => document.fonts.ready);
		const header = await page.locator('.draft-header').evaluate(root => {
			const mark = root.querySelector('.team-mark')!.getBoundingClientRect();
			const title = root.querySelector('.roll-copy')!.getBoundingClientRect();
			const style = getComputedStyle(root);
			return { centerDifference: Math.abs(mark.top + mark.height / 2 - title.top - title.height / 2),
				paddingDifference: Math.abs(parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) };
		});
		expect(header.centerDifference).toBeLessThan(1);
		expect(header.paddingDifference).toBeLessThan(1);
		const labelsFit = await page.getByRole('combobox', { name: 'Rank players & seasons', exact: true }).evaluate(node => {
			const select = node as HTMLSelectElement;
			const style = getComputedStyle(select);
			const context = document.createElement('canvas').getContext('2d')!;
			context.font = style.font;
			const available = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
			return [...select.options].every(option => context.measureText(option.label).width <= available);
		});
		expect(labelsFit).toBe(true);

		await openStory(page, 'draft-board--partial-roster');
		await page.evaluate(() => document.fonts.ready);
		for (const width of [1100, 1212, 1440]) {
			await page.setViewportSize({ width, height: 788 });
			const field = await page.locator('.field-scroll').evaluate(root => {
				const bounds = root.getBoundingClientRect();
				const slots = [...root.querySelectorAll<HTMLElement>('[data-slot]')].map(node => node.getBoundingClientRect());
				return {
					allFit: slots.every(slot => slot.top >= bounds.top && slot.bottom <= bounds.bottom),
					touchSafe: slots.every(slot => slot.width >= 44 && slot.height >= 44),
					overlap: slots.some((slot, index) => slots.slice(index + 1).some(other =>
						slot.left < other.right && slot.right > other.left && slot.top < other.bottom && slot.bottom > other.top))
				};
			});
			expect(field).toEqual({ allFit: true, touchSafe: true, overlap: false });
		}
	});

	test('deselects an outside click without cancelling card, slot, or confirmation actions', async ({ page }) => {
		await page.setViewportSize({ width: 1212, height: 788 });
		await openChoosing(page);
		const pick = candidate(page, '06');
		const preview = pick.getByRole('button', { name: /^Preview .+ at 2B$/ });
		const confirmation = page.locator('.field-footer .pick-confirmation');
		await expect(page.locator('.field-footer')).toHaveCount(0);
		await preview.click();
		const season = await confirmation.getAttribute('data-selected-season');
		await pick.getByRole('button', { name: 'Turn over', exact: true }).click();
		await expect(confirmation).toHaveAttribute('data-selected-season', season!);
		await pick.getByRole('button', { name: 'Show front', exact: true }).click();
		await expect(confirmation).toHaveAttribute('data-selected-season', season!);
		await page.locator('.field-panel [data-slot="2B"]').click();
		await expect(confirmation).toHaveAttribute('data-pending-slot', '2B');
		const search = page.getByRole('searchbox', { name: 'Find your pick', exact: true });
		await search.click();
		await expect(page.locator('.field-footer')).toHaveCount(0);
		await expect(search).toBeFocused();
		await expect(page.locator('.picked-count')).toHaveText('0 / 14');
		await preview.click();
		await confirmation.getByRole('button', { name: 'Draft at 2B', exact: true }).click();
		await expect(page.locator('.picked-count')).toHaveText('1 / 14');
		await expect(page.locator('.field-footer')).toHaveCount(0);
	});

	test('keeps desktop actions on one row and retains exact seasons across ranking pages', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openChoosing(page);
		for (const width of [1100, 1212, 1440]) {
			await page.setViewportSize({ width, height: 900 });
			await expect(page.locator('.wide-controls').first()).toBeVisible();
			const rows = await page.locator('.wide-controls').evaluateAll(nodes => nodes.map(row => {
				const controls = [...row.querySelectorAll('select, button')].map(node => node.getBoundingClientRect());
				return { aligned: controls.every(rect => Math.abs(rect.top - controls[0].top) < 1),
					touchSafe: controls.every(rect => rect.height >= 44),
					labels: [...row.querySelectorAll('option')].map(option => option.textContent?.trim()) };
			}));
			expect(rows.every(row => row.aligned && row.touchSafe && row.labels.every(label => /^\d{4}$/.test(label ?? '')))).toBe(true);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
			const layout = await page.locator('.candidate-card').first().evaluate(candidate => {
				const artwork = candidate.querySelector('.front .card')!.getBoundingClientRect();
				const bounds = candidate.getBoundingClientRect();
				const stack = candidate.querySelector('[data-flip]')!.getBoundingClientRect();
				return {
					startsWithArtwork: Math.abs(artwork.top - bounds.top) < 1,
					extraHeight: bounds.height - artwork.height,
					fullFront: artwork.width > 0 && Math.abs(artwork.height / artwork.width - 7 / 5) < .01 &&
						artwork.top >= stack.top - 1 && artwork.bottom <= stack.bottom + 1
				};
			});
			expect(layout.startsWithArtwork).toBe(true);
			expect(layout.extraHeight).toBeLessThanOrEqual(64);
			expect(layout.fullFront).toBe(true);
		}
		const group = page.locator('.candidate-card:has(select option:nth-child(2))').first();
		const playerId = await group.getAttribute('data-candidate-group');
		const selectedGroup = page.locator(`.candidate-card[data-candidate-group="${playerId}"]`);
		const select = group.locator('.wide-season-picker select');
		const seasonId = await select.evaluate(node => {
			const input = node as HTMLSelectElement;
			return [...input.options].find(option => option.value !== input.value)!.value;
		});
		await select.selectOption(seasonId);
		await expect(selectedGroup).toHaveCount(0);
		await page.getByRole('navigation', { name: 'Player card pages' }).getByRole('button', { name: 'Next', exact: true }).click();
		await expect(selectedGroup.locator('.player-card')).toHaveAttribute('data-season-id', seasonId);
		await selectedGroup.getByRole('button', { name: 'Turn over', exact: true }).click();
		await selectedGroup.getByRole('button', { name: /^Show text version for / }).click();
		await expect(selectedGroup.getByRole('region', { name: 'Historical season text version', exact: true })).toBeVisible();
		await selectedGroup.getByRole('button', { name: 'Show front', exact: true }).click();
		await expect(selectedGroup.getByRole('button', { name: 'Text version', exact: true })).toHaveCount(0);
	});

	test('filters qualified candidates, reorders through real sort and ranking states, and pages results', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openChoosing(page);
		const warOrder = await candidateGroups(page);
		await page.getByRole('combobox', { name: 'Rank players & seasons', exact: true }).selectOption('metrics');
		await expect.poll(() => candidateGroups(page)).not.toEqual(warOrder);

		await page.getByRole('button', { name: 'CF', exact: true }).click();
		await expect(candidate(page, '01')).toHaveCount(0);
		await expect(candidate(page, '02')).toBeVisible();

		await page.getByRole('button', { name: 'All', exact: true }).click();
		const firstPage = await candidateGroups(page);
		await expect(page.getByRole('navigation', { name: 'Player card pages' })).toBeVisible();
		await page.getByRole('button', { name: 'Next', exact: true }).click();
		await expect.poll(() => candidateGroups(page)).not.toEqual(firstPage);
		await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeEnabled();
		await expect(page.locator('.candidate-card[data-candidate-group]').first()).toBeInViewport();
		await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
		const pagination = page.getByRole('navigation', { name: 'Player card pages' });
		await expect(pagination.getByRole('status')).toContainText('25 players');
		for (const width of [320, 402, 1212]) {
			await page.setViewportSize({ width, height: 788 });
			const bounds = await pagination.evaluate(nav => {
				const rect = nav.getBoundingClientRect();
				const parent = nav.parentElement!.getBoundingClientRect();
				return {
					width: rect.width, available: parent.width,
					centerDifference: Math.abs(rect.left + rect.width / 2 - parent.left - parent.width / 2),
					touchSafe: [...nav.querySelectorAll('button')].every(button => button.getBoundingClientRect().height >= 44)
				};
			});
			expect(bounds.width).toBeLessThanOrEqual(bounds.available);
			expect(bounds.touchSafe).toBe(true);
			expect(bounds.centerDifference).toBeLessThan(1);
		}
		await pagination.getByRole('button', { name: 'Previous', exact: true }).click();
		await expect(pagination.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
		await expect.poll(() => candidateGroups(page)).toEqual(firstPage);

		await openStory(page, 'draft-board--rankings-loading');
		await expect(page.getByRole('status').filter({ hasText: /Example rankings are loading/ })).toBeVisible();
		const loadingOrder = await candidateGroups(page);
		await page.getByRole('button', { name: 'Load rankings', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Load rankings', exact: true })).toHaveCount(0);
		await expect.poll(() => candidateGroups(page)).not.toEqual(loadingOrder);

		await openStory(page, 'draft-board--rankings-unavailable');
		await expect(page.getByRole('alert').filter({ hasText: /Example rankings are unavailable/ })).toBeVisible();
		await page.getByRole('combobox', { name: 'Rank players & seasons', exact: true }).selectOption('war');
		const unavailableOrder = await candidateGroups(page);
		await page.getByRole('button', { name: 'Retry rankings', exact: true }).click();
		await expect.poll(() => candidateGroups(page)).not.toEqual(unavailableOrder);
	});

	test('resets search, pagination, and the initial selectable pool without leaving an overlay', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openChoosing(page);
		const search = page.getByRole('searchbox', { name: 'Find your pick', exact: true });
		await page.getByRole('button', { name: 'Next', exact: true }).click();
		await search.fill('Example Candidate 06');
		await expect(candidate(page, '06')).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Player card pages' })).toHaveCount(0);
		await page.getByRole('button', { name: 'Reset story', exact: true }).click();
		await expect(search).toHaveValue('');
		await expect(page.getByRole('navigation', { name: 'Player card pages' })).toContainText('1 / 2');
		await expect(candidate(page, '01')).toBeVisible();
		await page.setViewportSize({ width: 402, height: 874 });
		await candidate(page, '06').getByRole('button', { name: /^Select / }).click();
		await expect(page.locator('dialog.draft-sheet[open]')).toBeVisible();
		await openStory(page, 'draft-board--revealing');
		await expect(page.locator('dialog[open]')).toHaveCount(0);
		await page.getByRole('button', { name: 'Reset story', exact: true }).click();
		await expect(page.locator('.candidates')).toBeVisible();
		await expect(page.locator('dialog[open]')).toHaveCount(0);
	});
});

test.describe('Draft board field sheet', () => {
	test('cancels and confirms a mobile selection, restoring focus and scroll state', async ({ page }) => {
		await page.setViewportSize({ width: 402, height: 874 });
		await openChoosing(page);
		const before = await page.evaluate(() => ({ body: document.body.style.overflow, root: document.documentElement.style.overflow }));
		const card = candidate(page, '06');
		const select = card.getByRole('button', { name: /^Select / });
		await select.click();
		const sheet = page.locator('dialog.draft-sheet[open]');
		await expect(sheet).toBeVisible();
		await expect(page.locator('.picked-count')).toHaveText('0 / 14');
		await page.keyboard.press('Escape');
		await expect(sheet).toHaveCount(0);
		await expect(select).toBeFocused();
		expect(await page.evaluate(() => ({ body: document.body.style.overflow, root: document.documentElement.style.overflow }))).toEqual(before);

		await select.click();
		await expect(sheet.locator('.pick-confirmation')).toHaveAttribute('data-pending-slot', '2B');
		await sheet.getByRole('button', { name: 'Draft at 2B', exact: true }).click();
		await expect(page.getByRole('button', { name: /Open your field 1 \/ 14/ })).toBeVisible();
		await expect(page.locator('.pick-confirmation')).toHaveCount(0);
	});

	test('keeps a failed confirmation intact and transfers a mobile preview to the desktop field panel', async ({ page }) => {
		await page.setViewportSize({ width: 402, height: 874 });
		await openChoosing(page, '&args=commitError:true');
		const card = candidate(page, '06');
		await card.getByRole('button', { name: /^Select / }).click();
		const sheet = page.locator('dialog.draft-sheet[open]');
		const confirmation = sheet.locator('.pick-confirmation');
		const selectedSeason = await confirmation.getAttribute('data-selected-season');
		await expect(confirmation).toHaveAttribute('data-pending-slot', '2B');
		await sheet.getByRole('button', { name: 'Draft at 2B', exact: true }).click();
		await expect(sheet.getByRole('alert')).toContainText('Example draft confirmation failed');
		await expect(confirmation).toHaveAttribute('data-selected-season', selectedSeason ?? '');
		await expect(confirmation).toHaveAttribute('data-pending-slot', '2B');
		await expect(page.locator('.picked-count')).toHaveText('0 / 14');

		await page.setViewportSize({ width: 1440, height: 900 });
		await expect(page.locator('dialog.draft-sheet[open]')).toHaveCount(0);
		const panelConfirmation = page.locator('.field-panel .pick-confirmation');
		await expect(panelConfirmation).toHaveAttribute('data-selected-season', selectedSeason ?? '');
		await expect(panelConfirmation).toHaveAttribute('data-pending-slot', '2B');
		await expect(page.locator('.field-panel').getByRole('heading', { name: /^Your field/ })).toBeFocused();
	});

	test('preserves candidate and roster review backs through resize without committing a preview', async ({ page }) => {
		await page.setViewportSize({ width: 402, height: 874 });
		await openStoryByName(page, 'Draft/Board', 'Partial roster');
		const stored = await page.evaluate(() => ['162-zero:v1', '162-zero:settings:v1'].map(key => localStorage.getItem(key)));
		await page.getByRole('button', { name: /Roll next franchise/ }).click();
		await page.locator('.candidate-card').first().getByRole('button', { name: /^Select / }).click();
		let owner = page.locator('dialog.draft-sheet[open]');
		const selected = await owner.locator('.pick-confirmation').getAttribute('data-selected-season');
		const destination = await owner.locator('.pick-confirmation').getAttribute('data-pending-slot');
		expect(destination).not.toBe('');
		await owner.getByRole('tab', { name: 'Card back', exact: true }).click();
		await owner.getByRole('button', { name: /^Show text version for / }).click();
		await owner.getByRole('button', { name: 'Show front', exact: true }).click();
		await owner.getByRole('tab', { name: 'Field', exact: true }).click();
		await owner.locator('[data-slot="SP1"]').click();
		await expect(owner.locator('.card-review.raised-only [data-cardbox]')).toHaveAttribute('data-face', 'front');
		await owner.locator('.card-review.raised-only').getByRole('button', { name: 'Turn over', exact: true }).click();
		await owner.getByRole('button', { name: /^Show text version for / }).click();
		for (const width of [1440, 402, 1440, 402]) {
			await page.setViewportSize({ width, height: 900 });
			owner = page.locator(width === 402 ? 'dialog.draft-sheet[open]' : '.field-panel');
			await expect(owner.locator('.card-review.raised-only').getByRole('button', { name: 'Text version', exact: true })).toHaveAttribute('aria-pressed', 'true');
			await expect(owner.locator('.pick-confirmation')).toHaveAttribute('data-selected-season', selected!);
			await expect(owner.locator('.pick-confirmation')).toHaveAttribute('data-pending-slot', destination!);
			await expect(page.locator('.picked-count')).toHaveText('6 / 14');
			await expect(page.locator('dialog[open]')).toHaveCount(width === 402 ? 1 : 0);
		}
		await owner.getByRole('button', { name: 'Show front', exact: true }).click();
		await expect(owner.locator('.card-review.raised-only')).toHaveCount(0);
		await owner.getByRole('tab', { name: 'Card back', exact: true }).click();
		await expect(owner.getByRole('button', { name: 'Text version', exact: true })).toHaveAttribute('aria-pressed', 'true');
		await owner.getByRole('button', { name: 'Show front', exact: true }).click();
		await owner.getByRole('tab', { name: 'Field', exact: true }).click();
		expect(await page.evaluate(() => ['162-zero:v1', '162-zero:settings:v1'].map(key => localStorage.getItem(key)))).toEqual(stored);
		await owner.getByRole('button', { name: `Draft at ${destination}`, exact: true }).click();
		await expect(page.getByRole('button', { name: /Open your field 7 \/ 14/ })).toBeVisible();
	});
});

test('second-click roster reading keeps the field and move selection in place', async ({ page }) => {
	await page.setViewportSize({ width: 1212, height: 788 });
	await openStoryByName(page, 'Draft/Board', 'Partial roster');
	const slot = page.locator('.field-panel [data-slot="2B"]');
	await slot.click();
	await expect(page.getByRole('button', { name: 'Cancel move', exact: true })).toBeVisible();
	const fieldPose = () => page.locator('.field-panel .roster').evaluate(root => ({
		scroll: scrollY,
		cards: [...root.querySelectorAll('.miniature .card')].map(card => {
			const rect = card.getBoundingClientRect();
			return [rect.x, rect.y, rect.width, rect.height];
		})
	}));
	await page.evaluate(() => document.fonts.ready);
	const original = await fieldPose();
	await slot.click();
	await expect(page.locator('[data-card-reader]:popover-open')).toHaveCount(1);
	await expect(page.locator('.field-panel .roster')).toBeVisible();
	await expect(page.locator('.card-review.raised-only [data-cardbox]')).toHaveAttribute('data-face', 'front');
	await expect(page.locator('[data-card-reader]:popover-open').getByRole('button', { name: 'Turn over', exact: true })).toBeFocused();
	expect(await fieldPose()).toEqual(original);

	// A third click on the inspected source returns to the move state instead of reopening it.
	await slot.click();
	await expect(page.locator('[data-card-reader]:popover-open')).toHaveCount(0);
	expect(await fieldPose()).toEqual(original);
	await expect(slot).toBeFocused();
	await expect(page.getByRole('button', { name: 'Cancel move', exact: true })).toBeVisible();
});

test('Review first opens from the field and offers an explicit move without animation', async ({ page }) => {
	await page.setViewportSize({ width: 1212, height: 788 });
	await openStoryByName(page, 'Draft/Board', 'Partial roster');
	await page.getByRole('button', { name: 'Settings', exact: true }).click();
	const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
	await settings.getByRole('button', { name: 'Review first', exact: true }).click();
	const animation = settings.getByRole('switch', { name: 'Card review animation', exact: true });
	await expect(animation).toHaveAttribute('aria-checked', 'true');
	await animation.click();
	await expect(animation).toHaveAttribute('aria-checked', 'false');
	await settings.getByRole('button', { name: 'Close settings', exact: true }).click();
	const slot = page.locator('.field-panel [data-slot="2B"]');
	const field = await page.locator('.field-panel .roster').boundingBox();
	await slot.click();
	await expect(page.locator('[data-card-reader]:popover-open')).toHaveCount(1);
	expect(await page.locator('.field-panel .roster').boundingBox()).toEqual(field);
	await expect(page.locator('.card-review.raised-only [data-cardbox]')).toHaveAttribute('data-face', 'front');
	await expect(page.getByRole('button', { name: 'Cancel move', exact: true })).toHaveCount(0);
	const reader = page.locator('[data-card-reader]:popover-open');
	await expect(reader.getByRole('button', { name: 'Turn over', exact: true })).toBeFocused();
	await reader.getByRole('button', { name: 'Turn over', exact: true }).click();
	await expect(page.locator('.card-review.raised-only [data-cardbox]')).toHaveAttribute('data-face', 'back');
	await expect(reader.getByRole('button', { name: 'Move card', exact: true })).toBeVisible();
	await reader.getByRole('button', { name: 'Move card', exact: true }).click();
	await expect(page.locator('[data-card-reader]:popover-open')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Cancel move', exact: true })).toBeVisible();
	await expect(slot).toBeFocused();
});

