import { mount, tick, unmount } from 'svelte';
import Card from '../lib/cards/Card.svelte';
import { materialFor } from '../lib/cards/finish.ts';
import { contrast } from '../lib/cards/tokens.ts';
import type { CardViewModel } from '../lib/cards/view-model.ts';

type Era = CardViewModel['era'];
let active: { host: HTMLDivElement; instance: Record<string, unknown> } | null = null;

export async function disposeCompact(): Promise<void> {
	if (!active) return;
	await unmount(active.instance);
	active.host.remove();
	active = null;
}

export async function previewCompact(model: CardViewModel, era: Era, width = 72): Promise<void> {
	await disposeCompact();
	const host = document.createElement('div');
	host.id = 'compact-card-preview';
	host.style.cssText = `position:fixed;left:8px;top:8px;z-index:10000;width:${width}px;`;
	document.body.append(host);
	const instance = mount(Card, {
		target: host,
		props: { s: { ...model, era, fin: materialFor('gem') }, compact: true, onDetails: () => {} }
	});
	active = { host, instance };
	await tick();
	await document.fonts.ready;
	await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
	const card = host.querySelector<HTMLElement>('[data-card]')!;
	for (const [name, value] of Object.entries({ '--lift': '1', '--glare': '.3', '--mx': '50%', '--my': '85%' })) {
		card.style.setProperty(name, value);
	}
}

export interface CompactPixelClip {
	x: number;
	y: number;
	width: number;
	height: number;
}

function opaqueGround(label: HTMLElement): HTMLElement | null {
	let ground: HTMLElement | null = label;
	while (ground) {
		const color = getComputedStyle(ground).backgroundColor;
		if (color !== 'transparent' && !/^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(color)) break;
		ground = ground.parentElement;
	}
	return ground;
}

/**
 * Return document-space clips around only the rendered name fragments and
 * their opaque backing. Element screenshots include unrelated paint across a
 * full-width name bar, including the card-edge finish on some era layouts.
 */
export function compactNameClips(): CompactPixelClip[] {
	const name = active?.host.querySelector<HTMLElement>('.compact-plate .name');
	if (!name) throw new Error('Compact name is not mounted');
	const ground = opaqueGround(name);
	if (!ground) throw new Error('Compact name has no opaque ground');
	const groundRect = ground.getBoundingClientRect();
	const range = document.createRange();
	range.selectNodeContents(name);
	return [...range.getClientRects()].flatMap(rect => {
		const left = Math.max(Math.floor(rect.left - 1 + scrollX), Math.ceil(groundRect.left + scrollX));
		const top = Math.max(Math.floor(rect.top - 1 + scrollY), Math.ceil(groundRect.top + scrollY));
		const right = Math.min(Math.ceil(rect.right + 1 + scrollX), Math.floor(groundRect.right + scrollX));
		const bottom = Math.min(Math.ceil(rect.bottom + 1 + scrollY), Math.floor(groundRect.bottom + scrollY));
		return right > left && bottom > top ? [{ x: left, y: top, width: right - left, height: bottom - top }] : [];
	});
}

function colorHex(color: string): string {
	const channels = color.match(/[0-9.]+/g);
	if (!channels || channels.length !== 3) throw new Error(`Expected opaque RGB color: ${color}`);
	return '#' + channels.map(channel => Math.round(Number(channel)).toString(16).padStart(2, '0')).join('');
}

function compactRole(label: HTMLElement): string {
	if (label.classList.contains('name')) return 'name';
	if (label.closest('.position-rail') || label.classList.contains('roundel')) return 'position';
	if (label.classList.contains('stat') || label.matches('.meta > span:last-child')) return 'stat';
	if (label.matches('.meta > span:first-child')) return 'position';
	return 'label';
}

function relativeRect(rect: DOMRect, bounds: DOMRect): string {
	const values = [
		rect.left - bounds.left,
		rect.top - bounds.top,
		rect.right - bounds.left,
		rect.bottom - bounds.top
	];
	return `[${values.map(value => value.toFixed(2)).join(', ')}]`;
}

function compactProblems(host: HTMLElement): string[] {
	const problems: string[] = [];
	const card = host.querySelector<HTMLElement>('[data-card]')!;
	const bounds = card.getBoundingClientRect();
	if (bounds.width < 72) problems.push('Compact card shrank below 72px');
	const labels = host.querySelectorAll<HTMLElement>(
		'.compact-plate .name, .compact-plate .meta > span, .compact-plate .stat, .compact-plate .roundel, .compact-plate .position-rail span'
	);
	for (const label of labels) {
		const role = compactRole(label);
		const style = getComputedStyle(label);
		const fontSize = parseFloat(style.fontSize);
		const floor = role === 'name' ? 12 : 11;
		if (fontSize < floor) {
			problems.push(`Compact ${role} text fell below its ${floor}px floor (${fontSize.toFixed(2)}px)`);
		}
		const range = document.createRange();
		range.selectNodeContents(label);
		for (const [fragment, rect] of [...range.getClientRects()].entries()) {
			if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1) {
				const container = label.parentElement?.getBoundingClientRect();
				const containerBounds = container ? `; container=${relativeRect(container, bounds)}` : '';
				problems.push(
					`Compact ${role} text fragment ${fragment} escaped card: text=${relativeRect(rect, bounds)}; card=[0.00, 0.00, ${bounds.width.toFixed(2)}, ${bounds.height.toFixed(2)}]${containerBounds}`
				);
			}
		}
		const ground = opaqueGround(label);
		if (!ground) throw new Error(`Compact ${role} label has no opaque ground`);
		const ratio = contrast(colorHex(style.color), colorHex(getComputedStyle(ground).backgroundColor));
		if (ratio < 4.5) problems.push(`Compact ${role} label contrast is ${ratio}`);
	}
	return problems;
}

export async function inspectCompact(models: CardViewModel[], eras: Era[], widths: number[]) {
	const failures: Array<{ era: Era; width: number; problems: string[] }> = [];
	try {
		for (const model of models) for (const era of eras) for (const width of widths) {
			await previewCompact(model, era, width);
			const problems = compactProblems(active!.host);
			if (problems.length) failures.push({ era, width, problems });
		}
		return failures;
	} finally {
		await disposeCompact();
	}
}
