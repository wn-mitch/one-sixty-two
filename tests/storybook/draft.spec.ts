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
	test('deals the rolled franchise from the foil pack into the header', async ({ page }) => {
		await page.setViewportSize({ width: 1212, height: 788 });
		await openStoryByName(page, 'Draft/Board', 'Partial roster');
		const pack = page.getByRole('button', { name: 'Roll next franchise', exact: true });
		await expect(page.locator('.reveal [data-roll-mark]')).toHaveCount(0);
		await pack.focus();
		await pack.click();
		await expect(pack).toBeDisabled();
		// The dealt card names the roll before the header does.
		const dealt = page.locator('.dealt-card .front strong');
		await expect(dealt).toBeVisible();
		await expect(page.locator('.reveal.concealed .roll-copy')).toBeHidden();
		const franchise = await dealt.textContent();
		// The card waits face up until the player takes it.
		const take = page.getByRole('button', { name: /^Take / });
		await expect(take).toBeFocused();
		await page.waitForTimeout(500);
		await expect(page.locator('.candidates')).toHaveCount(0);
		await take.click();
		await expect(page.locator('.candidates')).toBeVisible({ timeout: 6000 });
		await expect(page.locator('.reveal h2')).toHaveText(franchise!);
		await expect(page.locator('.reveal')).not.toHaveClass(/concealed/);
		// Then the candidate cards deal out of the team card into the grid, in reading order.
		const flight = await page.locator('[data-candidate-group]').first().evaluate(node => {
			const animation = node.getAnimations()[0];
			if (!animation) return null;
			const start = String((animation.effect as KeyframeEffect).getKeyframes()[0].transform);
			const [, dx, dy] = start.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/)!.map(Number);
			// Measure the card's resting slot, without the flight's transform.
			animation.cancel();
			const card = node.getBoundingClientRect();
			const mark = document.querySelector('[data-roll-mark]')!.getBoundingClientRect();
			return { x: card.left + card.width / 2 + dx - (mark.left + mark.width / 2), y: card.top + card.height / 2 + dy - (mark.top + mark.height / 2) };
		});
		expect(flight).not.toBeNull();
		expect(Math.abs(flight!.x)).toBeLessThan(2);
		expect(Math.abs(flight!.y)).toBeLessThan(2);
		const delays = await page.locator('[data-candidate-group]').evaluateAll(nodes => nodes.slice(1, 4).map(node => node.getAnimations()[0]?.effect?.getTiming().delay ?? null));
		expect(delays.every((delay, index) => delay !== null && (index === 0 || delay > delays[index - 1]!))).toBe(true);
		await expect.poll(() => page.locator('[data-candidate-group]').evaluateAll(nodes => nodes.reduce((count, node) => count + node.getAnimations().length, 0))).toBe(0);
	});

	test('opens up to two ghost packs beside the dealt card, centers the dealt cards as a group, keeps the one taken, and hints only after a pause', async ({ page }) => {
		// Wide enough for three full-size cards with the ghost beside them.
		await page.setViewportSize({ width: 1512, height: 828 });
		await openStoryByName(page, 'Draft/Board', 'Partial roster');
		const caption = page.locator('.foil-pack .caption');
		await expect(caption).toHaveText('Tap the pack');
		await expect(caption).toHaveCSS('opacity', '0');
		const pack = page.getByRole('button', { name: 'Roll next franchise', exact: true });
		await pack.focus();
		await pack.press('Enter');
		const cards = page.locator('.foil-pack .dealt-card');
		await expect(cards.first()).toBeFocused();
		await expect(caption).toHaveCSS('opacity', '0');
		const first = await cards.first().getAttribute('aria-label');
		const dealtAt = await cards.first().boundingBox();
		// By role, so the spent pack falling away (inert, hidden) is not counted.
		const ghost = page.locator('.foil-pack').getByRole('button', { name: /^Add a franchise pack to choose from/ });
		await expect(ghost).toHaveAccessibleName('Add a franchise pack to choose from, 2 of 2 left');
		// A lone dealt card is set off from the extra-pack ghost.
		await expect(page.locator('.foil-pack .divider')).toHaveCount(1);
		// It sits midway between the lifted card's visible edge and the ghost.
		await expect.poll(() => page.evaluate(() => {
			const card = document.querySelector('.foil-pack .dealt-card')!.getBoundingClientRect();
			const line = document.querySelector('.foil-pack .divider')!.getBoundingClientRect();
			const next = document.querySelector('.foil-pack .ghost-pack')!.getBoundingClientRect();
			return Math.abs((line.left - card.right) - (next.left - line.right));
		})).toBeLessThan(1);
		await ghost.click();
		await expect(cards).toHaveCount(2);
		await expect(ghost).toHaveAccessibleName('Add a franchise pack to choose from, 1 of 2 left');
		await expect(page.locator('.foil-pack .divider')).toHaveCount(0);
		// The new card opens right of the dealt one and takes focus; the pair slides over to share the center.
		await expect(cards.first()).toHaveAttribute('aria-label', first!);
		await expect(cards.nth(1)).toBeFocused();
		// The new card lands at the same visible gap as the cards beside it and the ghost after it.
		const visibleGaps = () => page.evaluate(() => {
			const boxes = [...document.querySelectorAll('.foil-pack .dealt-card'), document.querySelector('.foil-pack .ghost-pack:not([inert])')]
				.filter(node => node).map(node => node!.getBoundingClientRect());
			return boxes.slice(1).map((box, index) => Math.round(box.left - boxes[index].right));
		});
		await expect.poll(visibleGaps).toEqual([12, 12]);
		await ghost.click();
		await expect(cards).toHaveCount(3);
		await expect(ghost).toHaveCount(0);
		const center = dealtAt!.x + dealtAt!.width / 2;
		await expect.poll(() => cards.evaluateAll(nodes => {
			const boxes = nodes.map(node => node.getBoundingClientRect());
			return (boxes[0].left + boxes.at(-1)!.right) / 2;
		})).toBeCloseTo(center, 0);
		const [left, middle, right] = await cards.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().left));
		expect(left).toBeLessThan(middle);
		expect(middle).toBeLessThan(right);
		// Once a second pack is out the packs are equal choices: no divider, evenly spaced.
		await expect(page.locator('.foil-pack .divider')).toHaveCount(0);
		expect(Math.abs((middle - left) - (right - middle))).toBeLessThan(1);
		await expect.poll(visibleGaps).toEqual([12, 12]);
		await expect(caption).toHaveText('Take one pack');
		await expect(caption).toHaveCSS('opacity', '1', { timeout: 8000 });
		// Three cards share the column without spilling past it.
		const column = await page.locator('.draft-browser').boundingBox();
		for (const box of await cards.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))) {
			expect(box.left).toBeGreaterThanOrEqual(column!.x - 1);
			expect(box.right).toBeLessThanOrEqual(column!.x + column!.width + 1);
		}
		const franchise = await cards.nth(1).locator('.front strong').textContent();
		await cards.nth(1).click();
		await expect(page.locator('.candidates')).toBeVisible({ timeout: 6000 });
		await expect(page.locator('.reveal h2')).toHaveText(franchise!);
		await expect(page.locator('.draft-header').getByRole('button', { name: /Add a franchise pack/ })).toBeDisabled();
	});

	test('adding a pack from the pool brings the current pack back beside the new one', async ({ page }) => {
		await page.setViewportSize({ width: 1212, height: 788 });
		await openChoosing(page);
		const current = await page.locator('.reveal h2').textContent();
		await page.locator('.draft-header').getByRole('button', { name: /Add a franchise pack/ }).click();
		const cards = page.locator('.foil-pack .dealt-card');
		// The table returns with the taken pack alone beside a ghost that shows but takes no clicks, then the added pack opens out of it.
		const ghost = page.locator('.foil-pack').getByRole('button', { name: /^Add a franchise pack to choose from/ });
		await expect(cards).toHaveCount(1);
		await expect(ghost).toBeDisabled();
		await expect(cards).toHaveCount(2);
		await expect(cards.nth(1)).toBeFocused();
		await expect(ghost).toBeEnabled();
		// It lands as a ghost-opened pack does, at the row's one visible gap.
		await expect.poll(() => page.evaluate(() => {
			const boxes = [...document.querySelectorAll('.foil-pack .dealt-card'), document.querySelector('.foil-pack .ghost-pack:not([inert])')]
				.filter(node => node).map(node => node!.getBoundingClientRect());
			return boxes.slice(1).map((box, index) => Math.round(box.left - boxes[index].right));
		})).toEqual([12, 12]);
		await expect(cards.first().locator('.front strong')).toHaveText(current!);
		const added = await cards.nth(1).locator('.front strong').textContent();
		expect(added).not.toBe(current);
		await cards.nth(1).click();
		await expect(page.locator('.candidates')).toBeVisible({ timeout: 6000 });
		await expect(page.locator('.reveal h2')).toHaveText(added!);
	});

	test('gathers leaving cards into a pile and settles the filtered grid when a filter changes', async ({ page }) => {
		await page.setViewportSize({ width: 1512, height: 828 });
		await openChoosing(page);
		await expect.poll(() => page.locator('[data-candidate-group]').count()).toBeGreaterThan(12);
		await page.locator('.filters').getByRole('button', { name: 'CF', exact: true }).click();
		// Cards that leave are scooped up as fixed ghosts, shrinking toward one pile.
		const ghosts = page.locator('body > [inert][aria-hidden="true"]');
		await expect.poll(() => ghosts.count()).toBeGreaterThan(0);
		await expect.poll(() => ghosts.first().evaluate(node => getComputedStyle(node).transform)).not.toBe('none');
		// Then the pile is gone and every remaining card rests in place, fully shown.
		await expect(ghosts).toHaveCount(0);
		const settled = await page.locator('[data-candidate-group]').evaluateAll(nodes => nodes.every(node => (node as HTMLElement).style.transform === '' && getComputedStyle(node).opacity === '1'));
		expect(settled).toBe(true);
	});

	test('skips the deal choreography with reduced motion', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await openStoryByName(page, 'Draft/Board', 'Partial roster');
		await page.getByRole('button', { name: 'Roll next franchise', exact: true }).click();
		await page.getByRole('button', { name: /^Take / }).click();
		await expect(page.locator('.candidates')).toBeVisible({ timeout: 2000 });
		await expect(page.locator('.foil-pack')).toHaveCount(0);
		expect(await page.locator('[data-candidate-group]').evaluateAll(nodes => nodes.reduce((count, node) => count + node.getAnimations().length, 0))).toBe(0);
	});

	for (const width of [1212, 390, 360]) {
		test(`keeps hitter cards on distinct field positions at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 844 });
			await openStoryByName(page, 'Draft/Board', 'Partial roster');
			if (width < 1024) await page.getByRole('button', { name: /^Open your field/ }).click();
			const field = page.locator(width < 1024 ? 'dialog.draft-sheet[open] .field-card .front' : '.field-panel .field-card .front');
			await expect(field.locator('.field-slot')).toHaveCount(9);
			const boxes = await field.locator('.field-slot').evaluateAll(slots => slots.map(slot => {
				const rect = slot.querySelector('.card-frame')!.getBoundingClientRect();
				return { slot: (slot as HTMLElement).dataset.slot!, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
			}));
			const overlaps = boxes.flatMap((a, index) => boxes.slice(index + 1)
				.filter(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
				.map(b => `${a.slot}/${b.slot}`));
			expect(overlaps).toEqual([]);
			const at = (slot: string) => boxes.find(box => box.slot === slot)!;
			// Middle infielders sit inside the corners, and every hitter stays on the field card.
			expect(at('2B').right).toBeLessThan(at('1B').left);
			expect(at('SS').left).toBeGreaterThan(at('3B').right);
			const bounds = await field.boundingBox();
			for (const box of boxes) {
				expect(box.left).toBeGreaterThanOrEqual(bounds!.x);
				expect(box.right).toBeLessThanOrEqual(bounds!.x + bounds!.width);
			}
		});
	}

	test('returns a partly covered card without a scrollbar landing jump', async ({ page }) => {
		await page.setViewportSize({ width: 1212, height: 788 });
		await openChoosing(page);
		await page.addStyleTag({ content: 'html { scrollbar-gutter: stable; }' });
		// Hold only the nested artwork's ambient tilt still; the reader's flight remains animated.
		await page.addStyleTag({ content: '.candidate-card .front .card { transform: none !important; }' });
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
			// Side by side there is no turn button; Escape puts the card down.
			reader.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
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
		await expect(first.locator('[data-card-reader]')).toBeFocused();
		const turnNext = next.getByRole('button', { name: 'Turn over', exact: true });
		await turnNext.evaluate(button => scrollTo(0, scrollY + button.getBoundingClientRect().top - (innerHeight - 48)));
		await turnNext.click();
		await expect(first.locator('[data-cardbox]')).toHaveAttribute('data-face', 'front');
		await expect(next.locator('[data-cardbox]')).toHaveAttribute('data-face', 'back');
		await expect(page.locator('[data-card-reader]:popover-open')).toHaveCount(1);
		await expect(next.locator('[data-card-reader]')).toBeFocused();
		await page.keyboard.press('Escape');
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
		const labelsFit = await page.getByRole('group', { name: 'Sort by', exact: true }).getByRole('button').evaluateAll(buttons => buttons.every(button => button.scrollWidth <= button.clientWidth));
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
		// Side by side, clicking the raised card puts it down without touching the selection.
		await pick.locator('[data-card-reader] .back').click({ position: { x: 20, y: 8 } });
		await expect(page.locator('[data-card-reader]:popover-open')).toHaveCount(0);
		await expect(confirmation).toHaveAttribute('data-selected-season', season!);
		await page.locator('.field-panel [data-slot="2B"]').click();
		await expect(confirmation).toHaveAttribute('data-pending-slot', '2B');
		// The already active sort is a control outside the cards that leaves the selection alone.
		const activeSort = page.getByRole('group', { name: 'Sort by', exact: true }).getByRole('button', { name: 'WAR', exact: true });
		await activeSort.click();
		await expect(page.locator('.field-footer')).toHaveCount(0);
		await expect(activeSort).toBeFocused();
		await expect(page.locator('.picked-count')).toHaveText('0 / 16');
		await preview.click();
		await confirmation.getByRole('button', { name: 'Draft at 2B', exact: true }).click();
		await expect(page.locator('.picked-count')).toHaveText('1 / 16');
		await expect(page.locator('.field-footer')).toHaveCount(0);
	});

	test('keeps desktop actions on one row and retains exact seasons while revealing more players', async ({ page }) => {
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
				const bounds = candidate as HTMLElement;
				const artwork = candidate.querySelector<HTMLElement>('.front .card')!;
				const stack = candidate.querySelector<HTMLElement>('[data-flip]')!;
				// Layout offsets exclude the artwork's intentional idle tilt without stopping motion.
				const top = (node: HTMLElement): number => {
					let offset = 0;
					for (let current: HTMLElement | null = node; current; current = current.offsetParent as HTMLElement | null) {
						offset += current.offsetTop;
					}
					return offset;
				};
				const artworkTop = top(artwork);
				const stackTop = top(stack);
				return {
					startsWithArtwork: Math.abs(artworkTop - top(bounds)) < 1,
					extraHeight: bounds.offsetHeight - artwork.offsetHeight,
					fullFront: artwork.offsetWidth > 0 && Math.abs(artwork.offsetHeight / artwork.offsetWidth - 7 / 5) < .01 &&
						artworkTop >= stackTop - 1 && artworkTop + artwork.offsetHeight <= stackTop + stack.offsetHeight + 1
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
		await expect(selectedGroup.locator('.player-card')).toHaveAttribute('data-season-id', seasonId);
		const more = page.getByRole('button', { name: 'Load more players', exact: true });
		await more.focus();
		await more.press('Enter');
		await expect(selectedGroup.locator('.player-card')).toHaveAttribute('data-season-id', seasonId);
		await selectedGroup.getByRole('button', { name: 'Turn over', exact: true }).click();
		await selectedGroup.getByRole('button', { name: /^Show text version for / }).click();
		await expect(selectedGroup.getByRole('region', { name: 'Historical season text version', exact: true })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(selectedGroup.getByRole('button', { name: 'Text version', exact: true })).toHaveCount(0);
	});

	test('filters qualified candidates, reorders through real ranking states, and appends results', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openChoosing(page);
		const warOrder = await candidateGroups(page);
		await page.getByRole('group', { name: 'Sort by', exact: true }).getByRole('button', { name: 'OPS / ERA', exact: true }).click();
		await expect.poll(() => candidateGroups(page)).not.toEqual(warOrder);

		await page.getByRole('button', { name: 'CF', exact: true }).click();
		await expect(candidate(page, '01')).toHaveCount(0);
		await expect(candidate(page, '02')).toBeVisible();

		await page.getByRole('button', { name: 'All', exact: true }).click();
		const initial = await candidateGroups(page);
		const more = page.getByRole('button', { name: 'Load more players', exact: true });
		await more.focus();
		await more.press('Enter');
		// Loading preserves the original prefix and moves keyboard focus to the first new card.
		await expect(page.locator('.pool-more')).toContainText('21 of 21 players');
		const appended = await candidateGroups(page);
		expect(appended.slice(0, initial.length)).toEqual(initial);
		await expect(page.locator('.candidate-card[data-candidate-group]').nth(initial.length).locator('button.select-front')).toBeFocused();
		await expect(more).toHaveCount(0);

		await openStory(page, 'draft-board--rankings-loading');
		await expect(page.getByRole('status').filter({ hasText: /Example rankings are loading/ })).toBeVisible();
		const loadingOrder = await candidateGroups(page);
		await page.getByRole('button', { name: 'Load rankings', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Load rankings', exact: true })).toHaveCount(0);
		await expect.poll(() => candidateGroups(page)).not.toEqual(loadingOrder);

		await openStory(page, 'draft-board--rankings-unavailable');
		await expect(page.getByRole('alert').filter({ hasText: /Example rankings are unavailable/ })).toBeVisible();
		await page.getByRole('group', { name: 'Sort by', exact: true }).getByRole('button', { name: 'WAR', exact: true }).click();
		const unavailableOrder = await candidateGroups(page);
		await page.getByRole('button', { name: 'Retry rankings', exact: true }).click();
		await expect.poll(() => candidateGroups(page)).not.toEqual(unavailableOrder);
	});

	test('resets the revealed pool without leaving an overlay', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openChoosing(page);
		const more = page.getByRole('button', { name: 'Load more players', exact: true });
		await more.focus();
		await more.press('Enter');
		await expect(page.locator('.pool-more')).toContainText('21 of 21 players');
		await page.getByRole('button', { name: 'Reset story', exact: true }).click();
		await expect(page.locator('.pool-more')).toContainText('20 of 21 players');
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
		await expect(page.locator('.picked-count')).toHaveText('0 / 16');
		await page.keyboard.press('Escape');
		await expect(sheet).toHaveCount(0);
		await expect(select).toBeFocused();
		expect(await page.evaluate(() => ({ body: document.body.style.overflow, root: document.documentElement.style.overflow }))).toEqual(before);

		await select.click();
		await expect(sheet.locator('.pick-confirmation')).toHaveAttribute('data-pending-slot', '2B');
		await sheet.getByRole('button', { name: 'Draft at 2B', exact: true }).click();
		await expect(page.getByRole('button', { name: /Open your field 1 \/ 16/ })).toBeVisible();
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
		// The error stacks above the sheet as its own modal; dismissing it leaves the sheet and preview intact.
		const errorDialog = page.locator('dialog.error-dialog[open]');
		await expect(errorDialog.getByRole('alert')).toContainText('Example draft confirmation failed');
		await errorDialog.getByRole('button', { name: 'Dismiss', exact: true }).click();
		await expect(errorDialog).toHaveCount(0);
		await expect(sheet).toBeVisible();
		await expect(confirmation).toHaveAttribute('data-selected-season', selectedSeason ?? '');
		await expect(confirmation).toHaveAttribute('data-pending-slot', '2B');
		await expect(page.locator('.picked-count')).toHaveText('0 / 16');

		await page.setViewportSize({ width: 1440, height: 900 });
		await expect(page.locator('dialog.draft-sheet[open]')).toHaveCount(0);
		const panelConfirmation = page.locator('.field-panel .pick-confirmation');
		await expect(panelConfirmation).toHaveAttribute('data-selected-season', selectedSeason ?? '');
		await expect(panelConfirmation).toHaveAttribute('data-pending-slot', '2B');
		await expect(page.locator('.field-panel').getByRole('heading', { name: /^Your field/ })).toBeFocused();
	});

	test('brings the candidate grid back when a desktop pick fails after it clears', async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await openChoosing(page, '&args=commitError:true');
		const card = candidate(page, '06');
		await card.getByRole('button', { name: /^Preview .+ at 2B$/ }).click();
		await page.locator('.field-panel').getByRole('button', { name: 'Draft at 2B', exact: true }).click();
		await expect(page.locator('dialog.error-dialog[open]')).toContainText('Example draft confirmation failed');
		const settled = await page.locator('.candidates').evaluate(root => ({
			// A card's light canvas fades in on its own first frame, whenever that lands; only the grid's motion counts.
			running: root.getAnimations({ subtree: true }).filter(animation => !(animation.effect as KeyframeEffect | null)?.target?.matches('canvas.light')).length,
			opacity: getComputedStyle(root).opacity,
			card: getComputedStyle(root.querySelector('[data-candidate-group]')!).opacity,
			inert: root.closest('.draft-browser')!.hasAttribute('inert')
		}));
		expect(settled).toEqual({ running: 0, opacity: '1', card: '1', inert: false });
	});

	test('preserves candidate and roster review backs through resize without committing a preview', async ({ page }) => {
		await page.setViewportSize({ width: 402, height: 874 });
		await openStoryByName(page, 'Draft/Board', 'Partial roster');
		const stored = await page.evaluate(() => ['162-zero:v1', '162-zero:settings:v1'].map(key => localStorage.getItem(key)));
		const pack = page.getByRole('button', { name: 'Roll next franchise', exact: true });
		// Focusing settles idle drift before the pointer clicks, without disabling pack motion.
		await pack.focus();
		await pack.click();
		await page.getByRole('button', { name: /^Take / }).click();
		await page.locator('.candidate-card').first().getByRole('button', { name: /^Select / }).click();
		let owner = page.locator('dialog.draft-sheet[open]');
		const selected = await owner.locator('.pick-confirmation').getAttribute('data-selected-season');
		const destination = await owner.locator('.pick-confirmation').getAttribute('data-pending-slot');
		expect(destination).not.toBe('');
		await owner.getByRole('tab', { name: 'Card back', exact: true }).click();
		await owner.getByRole('button', { name: /^Show text version for / }).click();
		await owner.getByRole('button', { name: 'Show front', exact: true }).click();
		await owner.getByRole('tab', { name: 'Field', exact: true }).click();
		await owner.locator('[data-slot="RP3"]').click();
		await expect(owner.locator('.card-review.raised-only [data-cardbox]')).toHaveAttribute('data-face', 'front');
		await owner.locator('.card-review.raised-only').getByRole('button', { name: 'Turn over', exact: true }).click();
		await owner.getByRole('button', { name: /^Show text version for / }).click();
		for (const width of [1440, 402, 1440, 402]) {
			await page.setViewportSize({ width, height: 900 });
			owner = page.locator(width === 402 ? 'dialog.draft-sheet[open]' : '.field-panel');
			await expect(owner.locator('.card-review.raised-only').getByRole('button', { name: 'Text version', exact: true })).toHaveAttribute('aria-pressed', 'true');
			await expect(owner.locator('.pick-confirmation')).toHaveAttribute('data-selected-season', selected!);
			await expect(owner.locator('.pick-confirmation')).toHaveAttribute('data-pending-slot', destination!);
			await expect(page.locator('.picked-count')).toHaveText('6 / 16');
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
		await expect(page.getByRole('button', { name: /Open your field 7 \/ 16/ })).toBeVisible();
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


test('picks a home stadium from the real park deck', async ({ page }) => {
	await openStory(page, 'draft-stadium--choosing');
	const deck = page.getByRole('region', { name: 'Choose your home stadium' });
	await expect(deck.locator('.stadium-card')).toHaveCount(30);
	const submit = deck.getByRole('button', { name: 'Draft at this stadium', exact: true });
	await expect(submit).toBeDisabled();
	// Turning a card over shows its geometry without choosing the park.
	const third = deck.locator('.choice').nth(2);
	await third.getByRole('button', { name: /^Turn over: .+ geometry$/ }).click();
	await expect(third.locator('.venue-card')).toHaveClass(/turned/);
	await expect(deck.getByRole('radio', { checked: true })).toHaveCount(0);
	await third.getByRole('button', { name: /^Turn over: .+ photo$/ }).click();
	await expect(third.locator('.venue-card')).not.toHaveClass(/turned/);
	await third.locator('.photo').click();
	await expect(deck.getByRole('radio').nth(2)).toBeChecked();
	const name = await deck.locator('.choice.selected .front h3').textContent();
	await expect(deck.locator('.commit p')).toHaveText(name!);
	await submit.click();
	await expect(page.getByRole('status').filter({ hasText: 'Drafting at' })).toHaveText(`Drafting at ${name}`);
	await expect(submit).toBeDisabled();
});

test('the field keeps every roster card apart and the stadium card turns it to the park details', async ({ page }) => {
	await page.setViewportSize({ width: 1212, height: 788 });
	await openStoryByName(page, 'Draft/Board', 'Partial roster');
	const field = page.locator('.field-panel .field-card');
	// No two slots, including staff placeholders and the stadium card, overlap anywhere on the card.
	const boxes = await field.locator('.field-slot, .staff-slot, .stadium-mini').evaluateAll(nodes => nodes.map(node => {
		const rect = node.getBoundingClientRect();
		return { name: (node as HTMLElement).dataset.slot ?? 'park', left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
	}));
	const overlaps = boxes.flatMap((a, index) => boxes.slice(index + 1)
		.filter(b => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)
		.map(b => `${a.name}/${b.name}`));
	expect(overlaps).toEqual([]);
	// The rotation and closer share the top staff row; the other relievers sit below it.
	const top = async (slot: string) => (await field.locator(`.staff-slot[data-slot="${slot}"]`).boundingBox())!.y;
	expect(Math.abs(await top('CL') - await top('SP1'))).toBeLessThan(1);
	expect(await top('RP1')).toBeGreaterThan(await top('CL'));
	const stadium = field.getByRole('button', { name: /\. Turn over for stadium details\.$/ });
	await expect(stadium).toContainText('Park');
	await stadium.click();
	await expect(field).toHaveClass(/turned/);
	await page.getByRole('button', { name: 'Show field', exact: true }).click();
	await expect(field).not.toHaveClass(/turned/);
});
