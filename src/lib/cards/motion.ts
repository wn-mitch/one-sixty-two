import { animate, type JSAnimation } from 'animejs';
import { appSettings } from '../game/settings.svelte.ts';
import { MOTION } from '../motion-timing.ts';
import { autonomousMotion, type MotionRegistration } from './motion-runtime.ts';

const LIGHT = { x: -0.45, y: -0.75 } as const;
const IDLE_AMOUNT = 2.5;
const MAX_TILT = 9;
const SPOTLIGHT_INTERVAL = 1800;
const SPOTLIGHT_DURATION = 2200;
const MOTION_PROPERTIES = ['--mx', '--my', '--lx', '--ly', '--ang', '--lift', '--glare', '--g1', '--g2', '--g3'] as const;

export type CardFinish = 'base' | 'silver' | 'gold' | 'gem';
type MotionProperty = (typeof MOTION_PROPERTIES)[number];
type FlipState = { angle: number; x: number; y: number; scale: number };
type StyleSnapshot = { transform: string; properties: Record<MotionProperty, string> };
type VisualState = {
	rx: number;
	ry: number;
	lift: number;
	hotspotX?: number;
	hotspotY?: number;
	twinkle?: number;
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

function stableUnit(value: string, salt = 0): number {
	let hash = 2166136261 ^ salt;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) / 4294967296;
}

function snapshotStyle(node: HTMLElement): StyleSnapshot {
	const properties = {} as Record<MotionProperty, string>;
	for (const property of MOTION_PROPERTIES) properties[property] = node.style.getPropertyValue(property);
	return { transform: node.style.transform, properties };
}

function restoreStyle(node: HTMLElement, snapshot: StyleSnapshot): void {
	node.style.transform = snapshot.transform;
	for (const property of MOTION_PROPERTIES) {
		const value = snapshot.properties[property];
		if (value) node.style.setProperty(property, value);
		else node.style.removeProperty(property);
	}
}

function applyFixedPose(node: HTMLElement): void {
	node.style.setProperty('--mx', '68%');
	node.style.setProperty('--my', '24%');
	node.style.setProperty('--lx', '.36');
	node.style.setProperty('--ly', '-.64');
	node.style.setProperty('--ang', '218deg');
	node.style.setProperty('--lift', '.42');
	node.style.setProperty('--glare', '.08');
	node.style.setProperty('--g1', '.92');
	node.style.setProperty('--g2', '.38');
	node.style.setProperty('--g3', '.66');
	node.style.transform = '';
}

function applyTilt(node: HTMLElement, state: VisualState): void {
	const hotspotX = clamp(state.hotspotX ?? 0.5 + LIGHT.x * 0.6 - state.ry / 26, -0.2, 1.2);
	const hotspotY = clamp(state.hotspotY ?? 0.5 + LIGHT.y * 0.6 + state.rx / 26, -0.2, 1.2);
	const lightX = clamp((hotspotX - 0.5) * 2, -1, 1);
	const lightY = clamp((hotspotY - 0.5) * 2, -1, 1);
	const twinkle = state.twinkle ?? 0;
	const spark = (x: number, y: number, phase: number) => clamp(
		1.15 - Math.hypot(hotspotX - x, hotspotY - y) * 1.6 + twinkle * phase,
		0.12,
		1
	).toFixed(2);

	node.style.setProperty('--mx', `${(hotspotX * 100).toFixed(1)}%`);
	node.style.setProperty('--my', `${(hotspotY * 100).toFixed(1)}%`);
	node.style.setProperty('--lx', lightX.toFixed(3));
	node.style.setProperty('--ly', lightY.toFixed(3));
	node.style.setProperty('--ang', `${(200 + state.ry * 9 - state.rx * 6).toFixed(1)}deg`);
	node.style.setProperty('--glare', (state.lift * 0.16).toFixed(3));
	node.style.setProperty('--lift', state.lift.toFixed(3));
	node.style.setProperty('--g1', spark(0.04, 0.03, 0.8));
	node.style.setProperty('--g2', spark(0.96, 0.97, -0.45));
	node.style.setProperty('--g3', spark(0.96, 0.4, 0.6));
	node.style.transform = state.flat || (!state.rx && !state.ry && !state.lift)
		? ''
		: `perspective(900px) rotateX(${state.rx.toFixed(2)}deg) rotateY(${state.ry.toFixed(2)}deg) scale(${(1 + state.lift * 0.025).toFixed(4)})`;
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

export function tilt(node: HTMLElement, initialOptions: TiltOptions = {}) {
	const snapshot = snapshotStyle(node);
	let options = initialOptions;
	let eventTarget = options.eventTarget ?? node;
	let registration: MotionRegistration;
	let unregisterWall: (() => void) | null = null;
	let wallRecord: WallRecord | null = null;
	let hovering = false;
	let focused = false;
	let pointerX = 0;
	let pointerY = 0;
	let currentX = 0;
	let currentY = 0;
	let currentLift = 0;
	let hoverBlend = 0;
	let dirty = true;
	let destroyed = false;
	let identity = options.identity ?? node.dataset.motionIdentity ?? node.getAttribute('data-card') ?? '';
	let phaseX1 = stableUnit(identity, 11) * Math.PI * 2;
	let phaseX2 = stableUnit(identity, 12) * Math.PI * 2;
	let phaseY1 = stableUnit(identity, 13) * Math.PI * 2;
	let phaseY2 = stableUnit(identity, 14) * Math.PI * 2;
	let frequencyX1 = 0.05 + stableUnit(identity, 21) * 0.12;
	let frequencyX2 = 0.05 + stableUnit(identity, 22) * 0.12;
	let frequencyY1 = 0.05 + stableUnit(identity, 23) * 0.12;
	let frequencyY2 = 0.05 + stableUnit(identity, 24) * 0.12;
	let wallOffset = stableUnit(identity, 31) * 7000;

	const autonomousEnabled = () => Boolean(options.idle || (options.wall && (options.finish ?? 'base') !== 'base'));
	let spotlightAngle = stableUnit(identity, 32) * Math.PI * 2;
	const interrupted = () => hovering || focused;
	const moving = () => Boolean(
		options.idle || interrupted() || hoverBlend > 0.001 ||
		Math.abs(currentX) > 0.01 || Math.abs(currentY) > 0.01 || currentLift > 0.001
	);

	const configureIdentity = (nextIdentity: string) => {
		identity = nextIdentity;
		phaseX1 = stableUnit(identity, 11) * Math.PI * 2;
		phaseX2 = stableUnit(identity, 12) * Math.PI * 2;
		phaseY1 = stableUnit(identity, 13) * Math.PI * 2;
		phaseY2 = stableUnit(identity, 14) * Math.PI * 2;
		frequencyX1 = 0.05 + stableUnit(identity, 21) * 0.12;
		frequencyX2 = 0.05 + stableUnit(identity, 22) * 0.12;
		frequencyY1 = 0.05 + stableUnit(identity, 23) * 0.12;
		frequencyY2 = 0.05 + stableUnit(identity, 24) * 0.12;
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

	const onMove = (event: PointerEvent) => {
		if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
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

	const onLeave = (event: PointerEvent) => {
		if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
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
		eventTarget.addEventListener('pointermove', onMove);
		eventTarget.addEventListener('pointerleave', onLeave);
		eventTarget.addEventListener('focusin', onFocusIn);
		eventTarget.addEventListener('focusout', onFocusOut);
	};

	const detachEvents = () => {
		eventTarget.removeEventListener('pointermove', onMove);
		eventTarget.removeEventListener('pointerleave', onLeave);
		eventTarget.removeEventListener('focusin', onFocusIn);
		eventTarget.removeEventListener('focusout', onFocusOut);
	};

	registration = autonomousMotion.register(node, {
		active(settings) {
			if (!settings.effectiveEnabled) return false;
			const desiredBlend = interrupted() ? 1 : 0;
			const pointerActive = hovering && (options.enabled ?? true);
			const directInteraction = pointerActive || focused;
			const targetX = pointerActive ? -pointerY * MAX_TILT : 0;
			const targetY = pointerActive ? pointerX * MAX_TILT : 0;
			const targetLift = directInteraction ? 1 : 0;
			const canRender = (options.enabled ?? true) || autonomousEnabled() || focused;
			return (dirty && canRender) ||
				(autonomousEnabled() && (!interrupted() || Math.abs(hoverBlend - desiredBlend) > 0.001)) ||
				Math.abs(currentX - targetX) > 0.01 || Math.abs(currentY - targetY) > 0.01 ||
				Math.abs(currentLift - targetLift) > 0.001;
		},
		frame({ time, delta }) {
			const desiredBlend = interrupted() ? 1 : 0;
			const blendStep = delta / 1000;
			hoverBlend = desiredBlend > hoverBlend
				? Math.min(desiredBlend, hoverBlend + blendStep)
				: Math.max(desiredBlend, hoverBlend - blendStep);
			const pointerActive = hovering && (options.enabled ?? true);
			const directInteraction = pointerActive || focused;
			const targetX = pointerActive ? -pointerY * MAX_TILT : 0;
			const targetY = pointerActive ? pointerX * MAX_TILT : 0;
			const targetLift = directInteraction ? 1 : 0;
			const response = 1 - Math.exp(-Math.max(delta, 1) / (interrupted() ? 72 : 220));
			currentX += (targetX - currentX) * response;
			currentY += (targetY - currentY) * response;
			currentLift += (targetLift - currentLift) * response;
			// Settle before the scheduler's activity threshold stops requesting frames.
			if (!directInteraction) {
				if (Math.abs(currentX) <= 0.01) currentX = 0;
				if (Math.abs(currentY) <= 0.01) currentY = 0;
				if (Math.abs(currentLift) <= 0.001) currentLift = 0;
			}
			let rx = currentX;
			let ry = currentY;
			let lift = currentLift;
			let hotspotX: number | undefined;
			let hotspotY: number | undefined;
			let twinkle = 0;
			const autonomousWeight = 1 - hoverBlend;
			if (options.idle && autonomousWeight > 0) {
				const seconds = time / 1000;
				rx += 2.4 * IDLE_AMOUNT * autonomousWeight * (
					0.62 * Math.sin(seconds * frequencyX1 * Math.PI * 2 + phaseX1) +
					0.38 * Math.sin(seconds * frequencyX2 * Math.PI * 2 + phaseX2)
				);
				ry += 3.4 * IDLE_AMOUNT * autonomousWeight * (
					0.62 * Math.sin(seconds * frequencyY1 * Math.PI * 2 + phaseY1) +
					0.38 * Math.sin(seconds * frequencyY2 * Math.PI * 2 + phaseY2)
				);
				lift = Math.max(lift, 0.12 * autonomousWeight);
			} else if (options.wall && (options.finish ?? 'base') !== 'base' && autonomousWeight > 0) {
				const phase = ((time + wallOffset) % 7000) / 7000;
				const sweep = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
				const spotlight = wallRecord ? wallSpotlights.amount(wallRecord, time) : 0;
				const spotlightWeight = spotlight * autonomousWeight;
				hotspotX = 0.08 + sweep * 0.84;
				hotspotY = 0.18 + Math.sin(phase * Math.PI * 2) * 0.08;
				rx += Math.sin(spotlightAngle) * 0.7 * spotlightWeight;
				ry += Math.cos(spotlightAngle) * 1.05 * spotlightWeight;
				lift = Math.max(lift, spotlightWeight * 0.55);
				if (options.finish === 'gem') {
					const seconds = time / 1000;
					twinkle = 0.22 * Math.sin(seconds * 2.7 + phaseX1) + 0.13 * Math.sin(seconds * 4.1 + phaseY2);
				}
			}
			applyTilt(node, { rx, ry, lift, hotspotX, hotspotY, twinkle });
			dirty = false;
		},
		state(settings, visible) {
			if (!visible) {
				restoreStyle(node, snapshot);
				return;
			}
			if (!settings.effectiveEnabled) {
				currentX = 0;
				currentY = 0;
				currentLift = 0;
				hoverBlend = 0;
				applyFixedPose(node);
				return;
			}
			dirty = true;
		}
	});
	attachEvents();
	configureWall();

	return {
		update(next: TiltOptions = {}) {
			const nextTarget = next.eventTarget ?? node;
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
			detachEvents();
			unregisterWall?.();
			registration.unregister();
			restoreStyle(node, snapshot);
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
		if (!reader.matches(':popover-open')) reader.showPopover();
	};
	const hideReader = () => {
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
			duration: MOTION.cardFlight / settings.cardSpeed,
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
