import { animate, type JSAnimation } from 'animejs';
import { appSettings } from '../game/settings.svelte.ts';
import { MOTION } from '../motion-timing.ts';
import { autonomousMotion, type MotionRegistration } from './motion-runtime.ts';
import type { CardLight } from './surface/card-light.ts';
import { easeToward, idleDrift, pointerEnvelope, pointerTilt, restingTilt, settled, stepTilt, tiltPose, type DriftRhythm, type Eased, type TiltState } from './tilt-math.ts';

export { TILT } from './tilt-math.ts';

const LIGHT = { x: -0.45, y: -0.75 } as const;
const SPOTLIGHT_INTERVAL = 1800;
const SPOTLIGHT_DURATION = 2200;

export type CardFinish = 'base' | 'silver' | 'gold' | 'gem';
type FlipState = { angle: number; x: number; y: number; scale: number };
type StyleSnapshot = { transform: string };
type VisualState = {
	rx: number;
	ry: number;
	/** Press envelope in degrees; sets how far the card sits back. */
	envelope: number;
	lift: number;
	hotspotX?: number;
	hotspotY?: number;
	flat?: boolean;
};

export interface TiltOptions {
	enabled?: boolean;
	/** Stable hit area when the animated face sits inside another element. */
	eventTarget?: HTMLElement;
	idle?: boolean;
	wall?: boolean;
	finish?: CardFinish;
	identity?: string;
	/** The card's WebGL light, which follows the tilt; without it the card keeps its static finish. */
	light?: CardLight;
}

export interface FlipOptions {
	turned?: boolean;
	opened?: boolean;
	sourceElement?: HTMLElement | null;
	onReturned?: () => void;
}

interface FlipRect {
	left: number;
	top: number;
	width: number;
	height: number;
}


const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const easeOutQuart = (value: number) => 1 - (1 - value) ** 4;

/** A stable 0..1 value for a string, so per-card rhythms survive re-renders. */
export function stableUnit(value: string, salt = 0): number {
	let hash = 2166136261 ^ salt;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) / 4294967296;
}

function snapshotStyle(node: HTMLElement): StyleSnapshot {
	return { transform: node.style.transform };
}

function restoreStyle(node: HTMLElement, snapshot: StyleSnapshot, light?: CardLight): void {
	node.style.transform = snapshot.transform;
	light?.rest();
}

/** Reduced motion holds the card flat under a fixed, readable light. */
function applyFixedPose(node: HTMLElement, light?: CardLight): void {
	node.style.transform = '';
	light?.set({ lightX: 0.68, lightY: 0.24, spotlight: 0.2 });
}

/**
 * Poses the card and moves its light. Only the transform is styled; the light is drawn by the card's
 * WebGL canvas. `direct` marks pointer or focus driven light, which redraws every frame.
 */
function applyTilt(node: HTMLElement, state: VisualState, halfWidth: number, halfHeight: number, light: CardLight | undefined, direct: boolean): void {
	const lightX = clamp(state.hotspotX ?? 0.5 + LIGHT.x * 0.6 - state.ry / 26, -0.2, 1.2);
	const lightY = clamp(state.hotspotY ?? 0.5 + LIGHT.y * 0.6 + state.rx / 26, -0.2, 1.2);
	light?.set({ lightX, lightY, spotlight: clamp(state.lift * 0.5, 0, 1) }, direct);
	node.style.transform = state.flat ? '' : tiltPose(state.rx, state.ry, state.envelope, halfWidth, halfHeight).transform;
}

interface WallRecord {
	identity: string;
	eligible(): boolean;
	visible(): boolean;
}

class WallSpotlights {
	#records = new Set<WallRecord>();
	#selection = new Map<number, WallRecord | null>();

	register(record: WallRecord): () => void {
		this.#records.add(record);
		return () => {
			this.#records.delete(record);
			for (const [bucket, selected] of this.#selection) if (selected === record) this.#selection.delete(bucket);
		};
	}

	#selected(bucket: number): WallRecord | null {
		const existing = this.#selection.get(bucket);
		if (existing !== undefined) return existing;
		const activeSelection = this.#selection.get(bucket - 1) ?? null;
		let selected: WallRecord | null = null;
		let score = Number.POSITIVE_INFINITY;
		for (const record of this.#records) {
			if (record === activeSelection || !record.visible() || !record.eligible()) continue;
			const candidate = stableUnit(record.identity, bucket);
			if (candidate < score) {
				score = candidate;
				selected = record;
			}
		}
		this.#selection.set(bucket, selected);
		for (const key of this.#selection.keys()) if (key < bucket - 2) this.#selection.delete(key);
		return selected;
	}

	amount(record: WallRecord, time: number): number {
		const bucket = Math.floor(time / SPOTLIGHT_INTERVAL);
		let amount = 0;
		for (const candidateBucket of [bucket - 1, bucket]) {
			if (candidateBucket < 0 || this.#selected(candidateBucket) !== record) continue;
			const progress = (time - candidateBucket * SPOTLIGHT_INTERVAL) / SPOTLIGHT_DURATION;
			if (progress >= 0 && progress < 1) amount = Math.max(amount, Math.sin(progress * Math.PI));
		}
		return amount;
	}
}

const wallSpotlights = new WallSpotlights();


/** A display: contents wrapper has no box, so it reports pointerleave between its children; use the nearest boxed ancestor. */
function hitArea(element: HTMLElement): HTMLElement {
	let area = element;
	while (area.parentElement && getComputedStyle(area).display === 'contents') area = area.parentElement;
	return area;
}

function driftRhythm(identity: string): DriftRhythm {
	return {
		phaseX1: stableUnit(identity, 11) * Math.PI * 2,
		phaseX2: stableUnit(identity, 12) * Math.PI * 2,
		phaseY1: stableUnit(identity, 13) * Math.PI * 2,
		phaseY2: stableUnit(identity, 14) * Math.PI * 2,
		frequencyX1: 0.05 + stableUnit(identity, 21) * 0.12,
		frequencyX2: 0.05 + stableUnit(identity, 22) * 0.12,
		frequencyY1: 0.05 + stableUnit(identity, 23) * 0.12,
		frequencyY2: 0.05 + stableUnit(identity, 24) * 0.12
	};
}

export function tilt(node: HTMLElement, initialOptions: TiltOptions = {}) {
	const snapshot = snapshotStyle(node);
	let options = initialOptions;
	let eventTarget = hitArea(options.eventTarget ?? node);
	let registration: MotionRegistration;
	let unregisterWall: (() => void) | null = null;
	let wallRecord: WallRecord | null = null;
	let hovering = false;
	let focused = false;
	let pointerX = 0;
	let pointerY = 0;
	const rest = (): Eased => ({ value: 0, velocity: 0 });
	let pose: TiltState = restingTilt();
	let currentLift = rest();
	let hoverBlend = 0;
	let dirty = true;
	let destroyed = false;
	let identity = options.identity ?? node.dataset.motionIdentity ?? node.getAttribute('data-card') ?? '';
	let rhythm = driftRhythm(identity);
	let wallOffset = stableUnit(identity, 31) * 7000;
	// Layout size, not the transformed box, so the footprint check measures the resting card.
	let halfWidth = node.offsetWidth / 2;
	let halfHeight = node.offsetHeight / 2;
	const resized = new ResizeObserver(() => {
		halfWidth = node.offsetWidth / 2;
		halfHeight = node.offsetHeight / 2;
		dirty = true;
	});
	resized.observe(node);

	const autonomousEnabled = () => Boolean(options.idle || (options.wall && (options.finish ?? 'base') !== 'base'));
	let spotlightAngle = stableUnit(identity, 32) * Math.PI * 2;
	const interrupted = () => hovering || focused;
	const moving = () => Boolean(
		options.idle || interrupted() || hoverBlend > 0.001 ||
		!settled(pose.x, 0, 0.01) || !settled(pose.y, 0, 0.01) || !settled(currentLift, 0, 0.001) || pose.envelope.value > 0.01
	);

	const configureIdentity = (nextIdentity: string) => {
		identity = nextIdentity;
		rhythm = driftRhythm(identity);
		wallOffset = stableUnit(identity, 31) * 7000;
		spotlightAngle = stableUnit(identity, 32) * Math.PI * 2;
	};
	const configureWall = () => {
		unregisterWall?.();
		unregisterWall = null;
		wallRecord = null;
		if (!options.wall || (options.finish ?? 'base') === 'base') return;
		wallRecord = {
			identity,
			eligible: () => !destroyed && !moving(),
			visible: () => registration.visible
		};
		unregisterWall = wallSpotlights.register(wallRecord);
	};

	// Touch tilts the card while a finger is down; the gesture ends on lift or when the page takes over to scroll.
	let touching = false;
	const onMove = (event: PointerEvent) => {
		if (event.pointerType === 'touch' ? !touching : event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
		hovering = true;
		if (options.enabled ?? true) {
			const bounds = eventTarget.getBoundingClientRect();
			if (bounds.width && bounds.height) {
				pointerX = clamp((event.clientX - bounds.left) / bounds.width - 0.5, -0.5, 0.5) * 2;
				pointerY = clamp((event.clientY - bounds.top) / bounds.height - 0.5, -0.5, 0.5) * 2;
			}
		}
		dirty = true;
		registration.wake();
	};

	const onDown = (event: PointerEvent) => {
		if (event.pointerType !== 'touch') return;
		touching = true;
		onMove(event);
	};

	const onTouchEnd = (event: PointerEvent) => {
		if (event.pointerType === 'touch') onLeave(event);
	};

	const onLeave = (event: PointerEvent) => {
		if (event.pointerType === 'touch') touching = false;
		else if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
		hovering = false;
		pointerX = 0;
		pointerY = 0;
		dirty = true;
		registration.wake();
	};

	const onFocusIn = () => {
		focused = true;
		dirty = true;
		registration.wake();
	};

	const onFocusOut = (event: FocusEvent) => {
		if (event.relatedTarget instanceof Node && eventTarget.contains(event.relatedTarget)) return;
		focused = false;
		dirty = true;
		registration.wake();
	};

	const attachEvents = () => {
		eventTarget.addEventListener('pointerdown', onDown);
		eventTarget.addEventListener('pointermove', onMove);
		eventTarget.addEventListener('pointerleave', onLeave);
		eventTarget.addEventListener('pointerup', onTouchEnd);
		eventTarget.addEventListener('pointercancel', onTouchEnd);
		eventTarget.addEventListener('focusin', onFocusIn);
		eventTarget.addEventListener('focusout', onFocusOut);
	};

	const detachEvents = () => {
		eventTarget.removeEventListener('pointerdown', onDown);
		eventTarget.removeEventListener('pointermove', onMove);
		eventTarget.removeEventListener('pointerleave', onLeave);
		eventTarget.removeEventListener('pointerup', onTouchEnd);
		eventTarget.removeEventListener('pointercancel', onTouchEnd);
		eventTarget.removeEventListener('focusin', onFocusIn);
		eventTarget.removeEventListener('focusout', onFocusOut);
	};

	registration = autonomousMotion.register(node, {
		active(settings) {
			// Passive drift and finish lighting stop only for reduced motion; the Motion setting governs pointer tilt.
			if (settings.reducedMotion) return false;
			// A raised card dims the page; cards behind it hold their ambient pose until it lands again.
			if (autonomousMotion.ambientHeld && !hovering && !focused && !dirty && !node.closest('[data-card-reader]:popover-open')) return false;
			const desiredBlend = interrupted() ? 1 : 0;
			const pointerActive = hovering && (options.enabled ?? true) && settings.effectiveEnabled;
			const directInteraction = pointerActive || focused;
			const target = pointerActive ? pointerTilt(pointerX, pointerY) : { rx: 0, ry: 0 };
			const targetLift = directInteraction ? 1 : 0;
			const canRender = (options.enabled ?? true) || autonomousEnabled() || focused;
			return (dirty && canRender) ||
				(autonomousEnabled() && (!interrupted() || Math.abs(hoverBlend - desiredBlend) > 0.001)) ||
				!settled(pose.x, target.rx, 0.01) || !settled(pose.y, target.ry, 0.01) ||
				!settled(currentLift, targetLift, 0.001) ||
				(pointerActive ? !settled(pose.envelope, pointerEnvelope(), 0.01) : pose.envelope.value > 0.01);
		},
		frame({ time, delta, settings }) {
			const desiredBlend = interrupted() ? 1 : 0;
			const blendStep = delta / 1000;
			hoverBlend = desiredBlend > hoverBlend
				? Math.min(desiredBlend, hoverBlend + blendStep)
				: Math.max(desiredBlend, hoverBlend - blendStep);
			const pointerActive = hovering && (options.enabled ?? true) && settings.effectiveEnabled;
			const directInteraction = pointerActive || focused;
			const target = pointerActive ? pointerTilt(pointerX, pointerY) : { rx: 0, ry: 0 };
			const targetLift = directInteraction ? 1 : 0;
			const holding = interrupted();
			currentLift = easeToward(currentLift, targetLift, delta, holding);
			if (!directInteraction && settled(currentLift, 0, 0.001)) currentLift = rest();
			let lift = currentLift.value;
			let offsetX = 0;
			let offsetY = 0;
			let hotspotX: number | undefined;
			let hotspotY: number | undefined;
			const autonomousWeight = 1 - hoverBlend;
			if (options.idle && autonomousWeight > 0) {
				({ rx: offsetX, ry: offsetY } = idleDrift(time / 1000, rhythm, autonomousWeight));
				lift = Math.max(lift, 0.12 * autonomousWeight);
			} else if (options.wall && (options.finish ?? 'base') !== 'base' && autonomousWeight > 0) {
				const phase = ((time + wallOffset) % 7000) / 7000;
				const sweep = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
				const spotlight = wallRecord ? wallSpotlights.amount(wallRecord, time) : 0;
				const spotlightWeight = spotlight * autonomousWeight;
				hotspotX = 0.08 + sweep * 0.84;
				hotspotY = 0.18 + Math.sin(phase * Math.PI * 2) * 0.08;
				offsetX = Math.sin(spotlightAngle) * 0.7 * spotlightWeight;
				offsetY = Math.cos(spotlightAngle) * 1.05 * spotlightWeight;
				lift = Math.max(lift, spotlightWeight * 0.55);
			}
			const step = stepTilt(pose, { targetX: target.rx, targetY: target.ry, holding, pressing: pointerActive, offsetX, offsetY }, delta);
			pose = step.state;
			const { rx, ry, envelope } = step;
			// Settle before the scheduler's activity threshold stops requesting frames.
			if (!directInteraction) {
				if (settled(pose.x, 0, 0.01)) pose.x = rest();
				if (settled(pose.y, 0, 0.01)) pose.y = rest();
			}
			applyTilt(node, { rx, ry, envelope, lift, hotspotX, hotspotY }, halfWidth, halfHeight, options.light, directInteraction || hoverBlend > 0.001);
			dirty = false;
		},
		state(settings, visible) {
			if (!visible) {
				restoreStyle(node, snapshot, options.light);
				return;
			}
			if (settings.reducedMotion) {
				pose = restingTilt();
				currentLift = rest();
				hoverBlend = 0;
				applyFixedPose(node, options.light);
				return;
			}
			dirty = true;
		}
	});
	attachEvents();
	configureWall();

	return {
		update(next: TiltOptions = {}) {
			const nextTarget = hitArea(next.eventTarget ?? node);
			if (nextTarget !== eventTarget) {
				detachEvents();
				eventTarget = nextTarget;
				hovering = false;
				focused = false;
				pointerX = 0;
				pointerY = 0;
				attachEvents();
			}
			const nextIdentity = next.identity ?? node.dataset.motionIdentity ?? node.getAttribute('data-card') ?? '';
			options = next;
			if (nextIdentity !== identity) configureIdentity(nextIdentity);
			configureWall();
			dirty = true;
			registration.wake();
		},
		destroy() {
			destroyed = true;
			resized.disconnect();
			detachEvents();
			unregisterWall?.();
			registration.unregister();
			restoreStyle(node, snapshot, options.light);
		}
	};
}

export function flip(node: HTMLElement, options: FlipOptions = {}) {
	const releaseSettings = appSettings.retain();
	const snapshot = node.style.transform;
	let settings = appSettings.snapshot;
	let turned = options.turned ?? false;
	let opened = options.opened ?? turned;
	let animation: JSAnimation | undefined;
	let state: FlipState = { angle: turned ? 180 : 0, x: 0, y: 0, scale: 1 };
	const reader = node.parentElement!;
	const slot = reader.previousElementSibling as HTMLElement;
	const dialog = reader.closest('dialog');
	const fullFront = node.querySelector<HTMLElement>('.front .card');
	const frontOpacity = fullFront?.style.opacity ?? '';
	const frontTransition = fullFront?.style.transition ?? '';
	let hiddenSource: HTMLElement | null = null;
	let sourceVisibility = '';
	let clone: HTMLElement | null = null;
	let cloneWidth = 0;

	const restoreSource = () => {
		if (hiddenSource) hiddenSource.style.visibility = sourceVisibility;
		hiddenSource = null;
	};
	const captureSource = () => {
		const source = options.sourceElement;
		if (!source || hiddenSource === source) return;
		restoreSource();
		clone?.remove();
		const rect = source.getBoundingClientRect();
		if (!rect.width || !rect.height) return;
		// Preserve fitted compact typography and era geometry during the flight.
		cloneWidth = rect.width;
		clone = source.cloneNode(true) as HTMLElement;
		clone.setAttribute('aria-hidden', 'true');
		clone.setAttribute('inert', '');
		for (const element of [clone, ...clone.querySelectorAll('[id]')]) {
			if (!(element instanceof SVGElement)) element.removeAttribute('id');
		}
		Object.assign(clone.style, {
			opacity: '1',
			position: 'absolute', left: '0', top: '0', width: `${rect.width}px`,
			height: `${rect.height}px`, minWidth: '0', maxWidth: 'none', margin: '0',
			transformOrigin: 'top left', pointerEvents: 'none'
		});
		node.querySelector('.front')!.append(clone);
		clone.classList.add('flight-clone');
		hiddenSource = source;
		sourceVisibility = source.style.visibility;
		source.style.visibility = 'hidden';
	};
	const showReader = () => {
		if (dialog && !dialog.open) return;
		reader.removeAttribute('data-returning');
		if (!reader.matches(':popover-open')) reader.showPopover();
	};
	const hideReader = () => {
		reader.removeAttribute('data-returning');
		if (reader.matches(':popover-open')) reader.hidePopover();
	};
	const syncModalLayer = () => {
		if (!dialog?.open) {
			hideReader();
			restoreSource();
			return;
		}
		if (!opened) return;
		const focused = reader.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
		hideReader();
		showReader();
		focused?.focus({ preventScroll: true });
	};
	dialog?.addEventListener('toggle', syncModalLayer);
	const offsetFrom = (source: FlipRect, destination: FlipRect): Pick<FlipState, 'x' | 'y' | 'scale'> => ({
		x: source.left + source.width / 2 - destination.left - destination.width / 2,
		y: source.top + source.height / 2 - destination.top - destination.height / 2,
		scale: destination.width ? source.width / destination.width : 1
	});
	const readerPose = (): FlipRect => {
		const rect = reader.getBoundingClientRect();
		if (clone && cloneWidth) clone.style.transform = `scale(${node.offsetWidth / cloneWidth})`;
		return { left: rect.left + node.offsetLeft, top: rect.top + node.offsetTop, width: node.offsetWidth, height: node.offsetHeight };
	};
	const clipFlight = (source: FlipRect, destination: FlipRect) => {
		const header = reader.closest('.draft-board')?.querySelector<HTMLElement>('.draft-header');
		if (!header || getComputedStyle(header).position !== 'sticky') return;
		const bottom = header.getBoundingClientRect().bottom;
		reader.style.clipPath = source.top < bottom ? `inset(${bottom - destination.top}px -100vmax -100vmax)` : '';
	};
	const stop = () => {
		animation?.cancel();
		animation = undefined;
	};
	const apply = () => {
		if (!settings.animateCards) {
			node.style.transform = '';
			return;
		}
		const lift = Math.sin((Math.PI * state.angle) / 180) * 40;
		node.style.transform = `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, ${lift.toFixed(1)}px) scale(${state.scale.toFixed(4)}) perspective(1100px) rotateY(${state.angle.toFixed(2)}deg)`;
	};
	const showFullFront = (full: boolean, immediate = false) => {
		if (!clone || !fullFront) return;
		fullFront.style.transition = immediate ? 'none' : frontTransition;
		clone.style.opacity = full ? '0' : '1';
		fullFront.style.opacity = full ? frontOpacity : '0';
	};
	/** Fades between the compact source and the full front as the card travels; `amount` 1 shows the full front. */
	const blendFronts = (amount: number) => {
		if (!clone || !fullFront) return;
		fullFront.style.transition = 'none';
		clone.style.opacity = (1 - amount).toFixed(3);
		fullFront.style.opacity = amount >= 1 ? frontOpacity : amount.toFixed(3);
	};
	const crossfade = (progress: number, opening: boolean) => {
		// The swap happens mid-flight so the compact art reads at the source and the full front at the destination.
		const t = Math.min(1, Math.max(0, (progress - .12) / .5));
		const eased = t * t * (3 - 2 * t);
		blendFronts(opening ? eased : 1 - eased);
	};
	const settleFront = () => {
		hideReader();
		restoreSource();
		reader.style.clipPath = '';
		state = { angle: 0, x: 0, y: 0, scale: 1 };
		apply();
		queueMicrotask(() => {
			if (!opened && node.isConnected) options.onReturned?.();
		});
	};
	const setTarget = (nextOpened: boolean, nextTurned: boolean) => {
		if (nextOpened === opened && nextTurned === turned) return;
		stop();
		const sourceRect = (options.sourceElement ?? slot).getBoundingClientRect();
		const alreadyRaised = reader.matches(':popover-open');
		const wasOpened = opened;
		opened = nextOpened;
		turned = nextTurned;
		if (opened && !alreadyRaised) {
			captureSource();
			showReader();
		}
		// A returning card lets its backdrop and paired face fade while it flies home.
		reader.toggleAttribute('data-returning', !opened && alreadyRaised);
		const pose = readerPose();
		if (opened && !alreadyRaised) state = { angle: state.angle, ...offsetFrom(sourceRect, pose) };
		const flying = !opened || !wasOpened;
		if (flying) blendFronts(opened ? 0 : 1);
		else showFullFront(true, !wasOpened);
		if (flying) clipFlight(sourceRect, pose);
		const destination: FlipState = opened
			? { angle: turned ? 180 : 0, x: 0, y: 0, scale: 1 }
			: { angle: 0, ...offsetFrom(sourceRect, pose) };
		const finish = () => {
			animation = undefined;
			reader.style.clipPath = '';
			if (opened) showFullFront(true);
			else settleFront();
		};
		if (!settings.animateCards) {
			state = destination;
			apply();
			finish();
			return;
		}
		apply();
		const opening = opened;
		animation = animate(state, {
			...destination,
			// Putting a card down is quicker than raising it.
			duration: MOTION.cardFlight * (opening ? 1 : .6) / settings.cardSpeed,
			ease: 'outQuint',
			onUpdate: self => {
				apply();
				if (flying) crossfade(self.progress, opening);
			},
			onComplete: finish
		});
	};
	if (opened) {
		captureSource();
		showReader();
		readerPose();
		showFullFront(true);
	}
	apply();
	const unsubscribe = appSettings.subscribe(next => {
		const changed = next.animateCards !== settings.animateCards;
		settings = next;
		if (!changed) return;
		stop();
		reader.style.clipPath = '';
		state = { angle: turned ? 180 : 0, x: 0, y: 0, scale: 1 };
		apply();
		if (opened) showFullFront(true);
		else if (reader.matches(':popover-open')) settleFront();
	});
	return {
		update(next: FlipOptions = {}) {
			const sourceChanged = next.sourceElement !== options.sourceElement;
			options = next;
			if (sourceChanged) {
				restoreSource();
				clone?.remove();
				clone = null;
				if (fullFront) fullFront.style.opacity = frontOpacity;
				if (opened) {
					captureSource();
					showReader();
					readerPose();
					showFullFront(true);
					apply();
				}
			}
			setTarget(next.opened ?? next.turned ?? false, next.turned ?? false);
		},
		destroy() {
			stop();
			unsubscribe();
			dialog?.removeEventListener('toggle', syncModalLayer);
			releaseSettings();
			hideReader();
			restoreSource();
			clone?.remove();
			if (fullFront) {
				fullFront.style.opacity = frontOpacity;
				fullFront.style.transition = frontTransition;
			}
			node.style.transform = snapshot;
			reader.style.clipPath = '';
		}
	};
}
