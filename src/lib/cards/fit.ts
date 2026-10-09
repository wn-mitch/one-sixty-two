import type { Action, ActionReturn } from 'svelte/action';

/**
 * Template measurements are card units: one unit is one hundredth of the card
 * width. Actions accept template data attributes or programmatic options.
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
	force: boolean;
	resize: ResizeObserver | undefined;
	mutations: MutationObserver | undefined;
};
type JobStage = 'initial-write' | 'initial-read' | 'probe-write' | 'probe-read' | 'final-write' | 'final-read' | 'done' | 'skip' | 'failed';
type FitJob = { stage: JobStage; force: boolean; error?: unknown; prepare(): void; write(): void; read(): void };
type ControllerRun = { controller: CardController; jobs: FitJob[]; failed: boolean; error?: unknown };
const optionsByElement = new WeakMap<Element, FitOptions>();
const stateByElement = new WeakMap<Element, FitState>();
const controllers = new Map<HTMLElement, CardController>();
const pendingControllers = new Set<CardController>();
let animationFrame: number | undefined;
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
function arcDimensionsKey(element: SVGTextElement, card: HTMLElement | null, max: number | undefined, target: number | undefined): string {
	return `${element.textContent ?? ''}|${max ?? ''}|${target ?? ''}|${card?.clientWidth ?? 0}|${card?.clientHeight ?? 0}`;
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
function validBounds(max: number | undefined, min: number | undefined, wrapMin: number | undefined): boolean {
	return max !== undefined && min !== undefined && wrapMin !== undefined
		&& Number.isFinite(max) && Number.isFinite(min) && Number.isFinite(wrapMin)
		&& max > 0 && min > 0 && max >= min
		&& wrapMin > 0 && wrapMin <= max;
}
class TextFitJob implements FitJob {
	stage: JobStage = 'initial-write';
	error: unknown;
	private readonly element: HTMLElement;
	private readonly card: HTMLElement;
	private readonly state: FitState;
	force: boolean;
	private readonly options: FitOptions | undefined;
	private readonly auto: boolean;
	private unit = 0;
	private max: number | undefined;
	private min: number | undefined;
	private wrapMin: number | undefined;
	private lines = 1;
	private maxHeight = Number.POSITIVE_INFINITY;
	private authoredFontSize: string | undefined;
	private probeWrap = false;
	private probePurpose: 'max' | 'low' | 'binary' = 'max';
	private probeSize = 0;
	private low = 0;
	private high = 0;
	private fittedSize = 0;
	private wrapped = false;
	private overflow: string | undefined;
	constructor(element: HTMLElement, card: HTMLElement, force: boolean) {
		this.element = element;
		this.card = card;
		this.state = stateByElement.get(element) ?? {};
		stateByElement.set(element, this.state);
		this.force = force;
		this.options = optionsByElement.get(element);
		this.auto = this.options?.auto ?? element.getAttribute('data-fit') === 'auto';
	}
	prepare(): void {
		if (!this.force && this.state.key === dimensionsKey(this.element, this.card)) {
			this.stage = 'skip';
			return;
		}
		this.unit = this.card.clientWidth / 100;
		if (!Number.isFinite(this.unit) || this.unit <= 0) {
			this.stage = 'skip';
			return;
		}
		if (this.auto) {
			if (this.state.authoredFontSize === undefined) this.state.authoredFontSize = this.element.style.fontSize;
			this.authoredFontSize = this.state.authoredFontSize;
			this.lines = 1;
			this.maxHeight = Number.POSITIVE_INFINITY;
			return;
		}
		this.max = optionNumber(this.options, 'max', this.element, 'data-max');
		this.min = optionNumber(this.options, 'min', this.element, 'data-min');
		this.wrapMin = optionNumber(this.options, 'wrapMin', this.element, 'data-wrap-min', this.min);
		const requestedLines = this.options?.lines ?? numberAttribute(this.element, 'data-lines', 1) ?? 1;
		this.lines = requestedLines > 1 ? 2 : 1;
		const maxHeightUnits = optionNumber(this.options, 'maxH', this.element, 'data-max-h');
		if (maxHeightUnits !== undefined) this.maxHeight = maxHeightUnits * this.unit;
	}
	write(): void {
		if (this.stage === 'initial-write') {
			if (this.auto) {
				this.element.style.fontSize = this.authoredFontSize ?? '';
				this.element.style.whiteSpace = 'nowrap';
			}
			this.stage = 'initial-read';
		} else if (this.stage === 'probe-write') {
			this.element.style.fontSize = `${this.probeSize}cqw`;
			this.element.style.whiteSpace = this.probeWrap ? 'normal' : 'nowrap';
			this.stage = 'probe-read';
		} else if (this.stage === 'final-write') {
			this.element.style.fontSize = `${this.fittedSize}cqw`;
			this.element.style.whiteSpace = this.wrapped ? 'normal' : 'nowrap';
			setData(this.element, 'fitted', `${this.fittedSize.toFixed(1)}${this.wrapped ? ' wrap' : ''}`);
			setData(this.element, 'overflow', this.overflow);
			this.stage = 'final-read';
		}
	}
	read(): void {
		if (this.stage === 'initial-read') {
			if (this.auto) {
				const fontSize = getComputedStyle(this.element).fontSize;
				this.max = fontSize ? Number.parseFloat(fontSize) / this.unit : undefined;
				this.min = this.max === undefined ? undefined : this.max * 0.62;
				this.wrapMin = this.min;
			}
			if (!validBounds(this.max, this.min, this.wrapMin)) {
				this.stage = 'skip';
				return;
			}
			this.beginMaxProbe(false);
		} else if (this.stage === 'probe-read') {
			this.readProbe();
		} else if (this.stage === 'final-read') {
			// Read the key only after every final font write in this batch settled.
			this.state.key = dimensionsKey(this.element, this.card);
			this.stage = 'done';
		}
	}
	private beginMaxProbe(wrap: boolean): void {
		this.probeWrap = wrap;
		this.probePurpose = 'max';
		this.probeSize = this.max!;
		this.stage = 'probe-write';
	}
	private beginSearch(wrap: boolean): void {
		const lower = wrap ? this.wrapMin! : this.min!;
		this.probeWrap = wrap;
		this.low = Math.ceil((lower - Number.EPSILON) * 10);
		this.high = Math.floor((this.max! + Number.EPSILON) * 10);
		if (this.low > this.high) {
			this.searchFailed(wrap);
			return;
		}
		this.probePurpose = 'low';
		this.probeSize = this.low / 10;
		this.stage = 'probe-write';
	}
	private searchFailed(wrap: boolean): void {
		if (!wrap && this.lines === 2) this.beginMaxProbe(true);
		else this.finishOverflow();
	}
	private readProbe(): void {
		const styles = getComputedStyle(this.element);
		const padding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
		const height = this.element.scrollHeight - (Number.isFinite(padding) ? padding : 0);
		const sizeInPixels = this.probeSize * this.unit;
		const fits = this.element.scrollWidth <= this.element.clientWidth + EPSILON
			&& Math.round(height / Math.max(sizeInPixels * lineHeight(this.element, sizeInPixels), 1)) <= (this.probeWrap ? this.lines : 1)
			&& height <= this.maxHeight + EPSILON;
		if (this.probePurpose === 'max') {
			if (fits) this.finish(this.probeSize, this.probeWrap, undefined, true);
			else this.beginSearch(this.probeWrap);
			return;
		}
		if (!fits) {
			if (this.probePurpose === 'low') {
				this.searchFailed(this.probeWrap);
				return;
			}
			this.high = Math.floor(this.probeSize * 10) - 1;
		} else {
			this.low = Math.floor(this.probeSize * 10);
		}
		if (this.low >= this.high) {
			this.finish(this.low / 10, this.probeWrap, undefined, false);
			return;
		}
		this.probePurpose = 'binary';
		this.probeSize = Math.floor((this.low + this.high + 1) / 2) / 10;
		this.stage = 'probe-write';
	}
	private finish(size: number, wrapped: boolean, overflow: string | undefined, fromMax: boolean): void {
		this.fittedSize = fromMax ? floorTenth(size) : size;
		this.wrapped = wrapped;
		this.overflow = overflow;
		this.stage = 'final-write';
	}
	private finishOverflow(): void {
		this.fittedSize = ceilTenth((this.lines === 2 ? this.wrapMin : this.min)!);
		this.wrapped = this.lines === 2;
		this.overflow = '1';
		this.stage = 'final-write';
	}
}
class ArcFitJob implements FitJob {
	stage: JobStage = 'initial-write';
	error: unknown;
	private readonly element: SVGTextElement;
	private readonly card: HTMLElement | null;
	private readonly state: FitState;
	force: boolean;
	private readonly options: FitOptions | undefined;
	private max: number | undefined;
	private target: number | undefined;
	private fontSize = '';
	constructor(element: SVGTextElement, force: boolean) {
		this.element = element;
		this.card = cardFor(element);
		this.state = stateByElement.get(element) ?? {};
		stateByElement.set(element, this.state);
		this.force = force;
		this.options = optionsByElement.get(element);
	}
	prepare(): void {
		this.max = optionNumber(this.options, 'max', this.element, 'data-max');
		this.target = optionNumber(this.options, 'arcLength', this.element, 'data-fit-arc');
		if (!this.force && this.state.key === arcDimensionsKey(this.element, this.card, this.max, this.target)) {
			this.stage = 'skip';
			return;
		}
		if (this.max === undefined || this.target === undefined || this.max <= 0 || this.target <= 0) {
			this.stage = 'skip';
			return;
		}
	}
	write(): void {
		if (this.stage === 'initial-write') {
			this.element.style.fontSize = `${this.max}px`;
			this.stage = 'initial-read';
		} else if (this.stage === 'final-write') {
			this.element.style.fontSize = this.fontSize;
			this.stage = 'final-read';
		}
	}
	read(): void {
		if (this.stage === 'initial-read') {
			const length = this.element.getComputedTextLength();
			if (!length) {
				this.stage = 'skip';
				return;
			}
			const size = Math.min(this.max!, (this.max! * this.target!) / length);
			this.fontSize = `${size.toFixed(2)}px`;
			this.stage = 'final-write';
		} else if (this.stage === 'final-read') {
			this.state.key = arcDimensionsKey(this.element, this.card, this.max, this.target);
			this.stage = 'done';
		}
	}
}
function collect(root: ParentNode): Element[] {
	const own = root instanceof Element && root.matches(FIT_SELECTOR) ? [root] : [];
	return [...own, ...root.querySelectorAll(FIT_SELECTOR)];
}
function pending(job: FitJob): boolean {
	return job.stage !== 'done' && job.stage !== 'skip' && job.stage !== 'failed' && job.stage !== 'final-read';
}
function collectRun(controller: CardController, force: boolean, jobsByTarget: Map<Element, FitJob>): ControllerRun {
	const run: ControllerRun = { controller, jobs: [], failed: false };
	try {
		const targets = new Set<Element>([...collect(controller.card), ...controller.targets]);
		for (const element of targets) {
			let job = jobsByTarget.get(element);
			if (!job) {
				if (isFitText(element)) {
					const card = cardFor(element);
					if (!card) continue;
					job = new TextFitJob(element, card, force);
				} else if (isFitArc(element)) {
					job = new ArcFitJob(element, force);
				} else {
					continue;
				}
				jobsByTarget.set(element, job);
			}
			// Card roots and era fronts can observe the same text target.
			job.force ||= force;
			run.jobs.push(job);
		}
	} catch (error) {
		run.failed = true;
		run.error = error;
	}
	return run;
}
function markJobFailed(job: FitJob, error: unknown): void {
	job.error = error;
	job.stage = 'failed';
}
/**
 * Probe writes and layout reads run in separate passes across unique targets.
 * Final geometry keys are recorded only after every target finishes writing.
 */
function runRounds(jobs: ReadonlyMap<Element, FitJob>): void {
	for (const job of jobs.values()) {
		try {
			job.prepare();
		} catch (error) {
			markJobFailed(job, error);
		}
	}
	let active = true;
	while (active) {
		active = false;
		for (const job of jobs.values()) {
			if (!pending(job)) continue;
			active = true;
			try {
				job.write();
			} catch (error) {
				markJobFailed(job, error);
			}
		}
		for (const job of jobs.values()) {
			if (!pending(job)) continue;
			try {
				job.read();
			} catch (error) {
				markJobFailed(job, error);
			}
		}
	}
	for (const job of jobs.values()) {
		if (job.stage !== 'final-read') continue;
		try {
			job.read();
		} catch (error) {
			markJobFailed(job, error);
		}
	}
}
function emitFitted(run: ControllerRun): void {
	if (controllers.get(run.controller.card) !== run.controller) return;
	run.controller.card.dispatchEvent(new CustomEvent('cards:fitted', { bubbles: true }));
}
function flush(): void {
	animationFrame = undefined;
	const snapshot = [...pendingControllers];
	pendingControllers.clear();
	const jobsByTarget = new Map<Element, FitJob>();
	const runs: ControllerRun[] = [];
	for (const controller of snapshot) {
		const force = controller.force;
		// Clear before consumer events so reentrant scheduling survives.
		controller.force = false;
		if (controllers.get(controller.card) === controller) runs.push(collectRun(controller, force, jobsByTarget));
	}
	runRounds(jobsByTarget);
	let failed = false;
	let firstError: unknown;
	for (const run of runs) {
		for (const job of run.jobs) {
			if (job.stage !== 'failed' || run.failed) continue;
			run.failed = true;
			run.error = job.error;
		}
		if (controllers.get(run.controller.card) === run.controller) {
			run.controller.card.dataset.fitState = run.failed ? 'failed' : 'settled';
		}
		if (run.failed && !failed) {
			failed = true;
			firstError = run.error;
		}
	}
	// Commit all states before an event can reschedule another controller.
	for (const run of runs) {
		try {
			emitFitted(run);
		} catch (error) {
			if (!failed) {
				failed = true;
				firstError = error;
			}
		}
	}
	if (failed) throw firstError;
}
function schedule(controller: CardController, force = false): void {
	if (controllers.get(controller.card) !== controller) return;
	controller.force ||= force;
	controller.card.dataset.fitState = 'unsettled';
	pendingControllers.add(controller);
	if (animationFrame === undefined) animationFrame = requestAnimationFrame(flush);
}
// Font and option invalidation forces a fresh probe; resize/mutation scheduling remains key-driven.
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
		force: false,
		resize: undefined,
		mutations: undefined
	};
	if (typeof ResizeObserver !== 'undefined') {
		controller.resize = new ResizeObserver(() => schedule(controller));
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
	controller.targets.delete(target);
	controller.uses -= 1;
	if (controller.uses > 0) return;
	pendingControllers.delete(controller);
	if (pendingControllers.size === 0 && animationFrame !== undefined) {
		cancelAnimationFrame(animationFrame);
		animationFrame = undefined;
	}
	controller.resize?.disconnect();
	controller.mutations?.disconnect();
	controllers.delete(controller.card);
	detachFontListeners();
}
function createAction(node: Fittable, options: FitOptions | undefined): FitActionResult {
	const card = cardFor(node);
	if (!card) {
		return {
			update(next) {
				if (next) optionsByElement.set(node, next);
			}
		};
	}
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
/** Observes a complete card or a text target; individual actions can provide options. */
export const fit: Action<Fittable, FitOptions | undefined> = (node, options) => createAction(node, options);
/** Svelte action for an SVG text-path label using `data-fit-arc`. */
export const fitArc: Action<SVGTextElement, FitOptions | undefined> = (node, options) => createAction(node, options);
