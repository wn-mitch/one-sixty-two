import type { Action, ActionReturn } from 'svelte/action';

/**
 * Measurements in the templates are card units: one `u` is one hundredth of
 * the card width. The actions intentionally accept both their data attributes
 * and these options so a literal archive port needs no adapter.
 */
export interface FitOptions {
	auto?: boolean;
	max?: number;
	min?: number;
	wrapMin?: number;
	lines?: 1 | 2;
	maxH?: number;
	arcLength?: number;
}

type Fittable = HTMLElement | SVGTextElement;
type FitActionResult = ActionReturn<FitOptions | undefined>;

type FitState = {
	key?: string;
	authoredFontSize?: string;
};

type CardController = {
	card: HTMLElement;
	uses: number;
	targets: Set<Fittable>;
	frame: number | undefined;
	force: boolean;
	resize: ResizeObserver | undefined;
	mutations: MutationObserver | undefined;
};

const optionsByElement = new WeakMap<Element, FitOptions>();
const stateByElement = new WeakMap<Element, FitState>();
const controllers = new Map<HTMLElement, CardController>();
let fontListenersAttached = false;

const FIT_SELECTOR = '[data-fit], [data-fit-arc]';
const EPSILON = 0.5;

function numberAttribute(element: Element, name: string, fallback?: number): number | undefined {
	const value = element.getAttribute(name);
	if (value === null || value.trim() === '') return fallback;
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function optionNumber(
	options: FitOptions | undefined,
	key: keyof Pick<FitOptions, 'max' | 'min' | 'wrapMin' | 'maxH' | 'arcLength'>,
	element: Element,
	attribute: string,
	fallback?: number
): number | undefined {
	const value = options?.[key];
	return Number.isFinite(value) ? value : numberAttribute(element, attribute, fallback);
}

function cardFor(node: Element): HTMLElement | null {
	return node.closest<HTMLElement>('[data-card]');
}

function isFitText(element: Element): element is HTMLElement {
	return element instanceof HTMLElement && (element.hasAttribute('data-fit') || optionsByElement.has(element));
}

function isFitArc(element: Element): element is SVGTextElement {
	return element instanceof SVGTextElement && (element.hasAttribute('data-fit-arc') || optionsByElement.has(element));
}

function lineHeight(element: HTMLElement, fontSize: number): number {
	const computed = getComputedStyle(element).lineHeight;
	const measured = Number.parseFloat(computed);
	return Number.isFinite(measured) && fontSize > 0 ? measured / fontSize : 1;
}

function dimensionsKey(element: HTMLElement, card: HTMLElement): string {
	return [
		element.textContent ?? '',
		card.clientWidth,
		card.clientHeight,
		element.clientWidth,
		element.clientHeight,
		element.parentElement?.clientWidth ?? 0,
		element.parentElement?.clientHeight ?? 0
	].join('|');
}

function setData(element: HTMLElement, name: 'fitted' | 'overflow', value: string | undefined): void {
	if (value === undefined) element.removeAttribute(`data-${name}`);
	else element.setAttribute(`data-${name}`, value);
}


function floorTenth(value: number): number {
	return Math.floor((value + Number.EPSILON) * 10) / 10;
}

function ceilTenth(value: number): number {
	return Math.ceil((value - Number.EPSILON) * 10) / 10;
}

function fitText(element: HTMLElement, force = false): boolean {
	const card = cardFor(element);
	if (!card || card.clientWidth === 0) return false;

	const state = stateByElement.get(element) ?? {};
	stateByElement.set(element, state);
	const initialKey = dimensionsKey(element, card);
	if (!force && state.key === initialKey) return false;

	const options = optionsByElement.get(element);
	const auto = options?.auto ?? element.getAttribute('data-fit') === 'auto';
	const unit = card.clientWidth / 100;
	if (!Number.isFinite(unit) || unit <= 0) return false;

	let max: number | undefined;
	let min: number | undefined;
	let wrapMin: number | undefined;
	let lines: number;
	let maxHeight = Number.POSITIVE_INFINITY;

	if (auto) {
		if (state.authoredFontSize === undefined) state.authoredFontSize = element.style.fontSize;
		element.style.fontSize = state.authoredFontSize;
		element.style.whiteSpace = 'nowrap';
		const fontSize = getComputedStyle(element).fontSize;
		max = fontSize ? Number.parseFloat(fontSize) / unit : undefined;
		min = max === undefined ? undefined : max * 0.62;
		wrapMin = min;
		lines = 1;
	} else {
		max = optionNumber(options, 'max', element, 'data-max');
		min = optionNumber(options, 'min', element, 'data-min');
		wrapMin = optionNumber(options, 'wrapMin', element, 'data-wrap-min', min);
		const requestedLines = options?.lines ?? numberAttribute(element, 'data-lines', 1) ?? 1;
		lines = requestedLines > 1 ? 2 : 1;
		const maxHeightUnits = optionNumber(options, 'maxH', element, 'data-max-h');
		if (maxHeightUnits !== undefined) maxHeight = maxHeightUnits * unit;
	}

	if (
		max === undefined ||
		min === undefined ||
		wrapMin === undefined ||
		!Number.isFinite(max) ||
		!Number.isFinite(min) ||
		!Number.isFinite(wrapMin) ||
		max <= 0 ||
		min <= 0 ||
		max < min ||
		wrapMin <= 0 ||
		wrapMin > max
	) {
		return false;
	}
	const fits = (size: number, wrap: boolean): boolean => {
		element.style.fontSize = `${size}cqw`;
		element.style.whiteSpace = wrap ? 'normal' : 'nowrap';
		const styles = getComputedStyle(element);
		const padding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
		const height = element.scrollHeight - (Number.isFinite(padding) ? padding : 0);
		const sizeInPixels = size * unit;
		const count = Math.round(height / Math.max(sizeInPixels * lineHeight(element, sizeInPixels), 1));
		return (
			element.scrollWidth <= element.clientWidth + EPSILON &&
			count <= (wrap ? lines : 1) &&
			height <= maxHeight + EPSILON
		);
	};

	const search = (lower: number, upper: number, wrap: boolean): number | null => {
		let low = Math.ceil((lower - Number.EPSILON) * 10);
		let high = Math.floor((upper + Number.EPSILON) * 10);
		if (low > high || !fits(low / 10, wrap)) return null;
		while (low < high) {
			const middle = Math.floor((low + high + 1) / 2);
			if (fits(middle / 10, wrap)) low = middle;
			else high = middle - 1;
		}
		return low / 10;
	};

	let size: number | null = fits(max, false) ? floorTenth(max) : search(min, max, false);
	let wrapped = false;
	if (size === null && lines === 2) {
		size = fits(max, true) ? floorTenth(max) : search(wrapMin, max, true);
		wrapped = size !== null;
	}

	let overflow: string | undefined;
	if (size === null) {
		size = ceilTenth(lines === 2 ? wrapMin : min);
		wrapped = lines === 2;
		overflow = '1';
	}

	const fitted = `${size.toFixed(1)}${wrapped ? ' wrap' : ''}`;
	const changed = element.dataset.fitted !== fitted || element.dataset.overflow !== overflow;
	element.style.fontSize = `${size}cqw`;
	element.style.whiteSpace = wrapped ? 'normal' : 'nowrap';
	setData(element, 'fitted', fitted);
	setData(element, 'overflow', overflow);
	state.key = dimensionsKey(element, card);
	return changed;
}

function fitArcText(element: SVGTextElement, force = false): boolean {
	const state = stateByElement.get(element) ?? {};
	stateByElement.set(element, state);
	const options = optionsByElement.get(element);
	const max = optionNumber(options, 'max', element, 'data-max');
	const target = optionNumber(options, 'arcLength', element, 'data-fit-arc');
	const key = `${element.textContent ?? ''}|${max ?? ''}|${target ?? ''}`;
	if (!force && state.key === key) return false;
	if (max === undefined || target === undefined || max <= 0 || target <= 0) return false;

	element.style.fontSize = `${max}px`;
	const length = element.getComputedTextLength();
	if (!length) return false;
	const size = Math.min(max, (max * target) / length);
	const fontSize = `${size.toFixed(2)}px`;
	const changed = element.style.fontSize !== fontSize;
	element.style.fontSize = fontSize;
	state.key = key;
	return changed;
}

function collect(root: ParentNode): Element[] {
	const own = root instanceof Element && root.matches(FIT_SELECTOR) ? [root] : [];
	return [...own, ...root.querySelectorAll(FIT_SELECTOR)];
}

function emitFitted(cards: Iterable<HTMLElement>): void {
	for (const card of cards) {
		card.dispatchEvent(new CustomEvent('cards:fitted', { bubbles: true }));
	}
}


function schedule(controller: CardController, force = false): void {
	controller.force ||= force;
	if (controller.frame !== undefined) return;
	controller.frame = requestAnimationFrame(() => {
		controller.frame = undefined;
		const changed = fitCard(controller, controller.force);
		controller.force = false;
		if (changed) emitFitted([controller.card]);
	});
}

function fitCard(controller: CardController, force: boolean): boolean {
	let changed = false;
	const targets = new Set<Element>([...collect(controller.card), ...controller.targets]);
	for (const element of targets) {
		if (isFitText(element)) changed = fitText(element, force) || changed;
		else if (isFitArc(element)) changed = fitArcText(element, force) || changed;
	}
	return changed;
}

function invalidateAllFonts(): void {
	for (const controller of controllers.values()) schedule(controller, true);
}

function attachFontListeners(): void {
	if (fontListenersAttached || typeof document === 'undefined' || !document.fonts) return;
	fontListenersAttached = true;
	void document.fonts.ready.then(invalidateAllFonts);
	document.fonts.addEventListener('loadingdone', invalidateAllFonts);
}

function detachFontListeners(): void {
	if (!fontListenersAttached || controllers.size > 0 || typeof document === 'undefined' || !document.fonts) return;
	document.fonts.removeEventListener('loadingdone', invalidateAllFonts);
	fontListenersAttached = false;
}

function acquireCard(card: HTMLElement, target: Fittable): CardController {
	const existing = controllers.get(card);
	if (existing) {
		existing.uses += 1;
		existing.targets.add(target);
		return existing;
	}

	const controller: CardController = {
		card,
		uses: 1,
		targets: new Set([target]),
		frame: undefined,
		force: false,
		resize: undefined,
		mutations: undefined
	};
	if (typeof ResizeObserver !== 'undefined') {
		controller.resize = new ResizeObserver(() => schedule(controller, true));
		controller.resize.observe(card);
	}
	if (typeof MutationObserver !== 'undefined') {
		controller.mutations = new MutationObserver(() => schedule(controller));
		controller.mutations.observe(card, { childList: true, subtree: true, characterData: true });
	}
	controllers.set(card, controller);
	attachFontListeners();
	schedule(controller, true);
	return controller;
}

function releaseCard(controller: CardController, target: Fittable): void {
	controller.uses -= 1;
	controller.targets.delete(target);
	if (controller.uses > 0) return;
	if (controller.frame !== undefined) cancelAnimationFrame(controller.frame);
	controller.resize?.disconnect();
	controller.mutations?.disconnect();
	controllers.delete(controller.card);
	detachFontListeners();
}

function createAction(node: Fittable, options: FitOptions | undefined): FitActionResult {
	const card = cardFor(node);
	if (!card) return { update(next) { if (next) optionsByElement.set(node, next); } };
	if (options) optionsByElement.set(node, options);
	const controller = acquireCard(card, node);

	return {
		update(next) {
			if (next) optionsByElement.set(node, next);
			else optionsByElement.delete(node);
			schedule(controller, true);
		},
		destroy() {
			optionsByElement.delete(node);
			releaseCard(controller, node);
		}
	};
}

/**
 * Svelte action for a card root or a text target. A root action observes its
 * complete card; individual text actions are therefore optional but allow
 * programmatic options in addition to the archive data attributes.
 */
export const fit: Action<Fittable, FitOptions | undefined> = (node, options) => createAction(node, options);

/** Svelte action for an SVG text-path label using `data-fit-arc`. */
export const fitArc: Action<SVGTextElement, FitOptions | undefined> = (node, options) => createAction(node, options);
