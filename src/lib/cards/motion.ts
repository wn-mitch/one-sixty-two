import { animate, type JSAnimation } from 'animejs';

const LIGHT = { x: -0.45, y: -0.75 } as const;
const MAX_TILT = 9;
const MOTION_PROPERTIES = ['--mx', '--my', '--lx', '--ly', '--ang', '--lift', '--glare', '--g1', '--g2', '--g3'] as const;

type MotionProperty = (typeof MOTION_PROPERTIES)[number];

type TiltState = { rx: number; ry: number; lift: number };
type FlipState = { angle: number };
type StyleSnapshot = { transform: string; properties: Record<MotionProperty, string> };

export interface TiltOptions {
	enabled?: boolean;
	/** Stable hit area when the animated face sits inside another element. */
	eventTarget?: HTMLElement;
}

export interface FlipOptions {
	turned?: boolean;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function snapshotStyle(node: HTMLElement): StyleSnapshot {
	const properties = {} as Record<MotionProperty, string>;
	for (const property of MOTION_PROPERTIES) {
		properties[property] = node.style.getPropertyValue(property);
	}
	return { transform: node.style.transform, properties };
}

function restoreStyle(node: HTMLElement, snapshot: StyleSnapshot) {
	node.style.transform = snapshot.transform;
	for (const property of MOTION_PROPERTIES) {
		const value = snapshot.properties[property];
		if (value) node.style.setProperty(property, value);
		else node.style.removeProperty(property);
	}
}

function applyTilt(node: HTMLElement, state: TiltState) {
	const hotspotX = clamp(0.5 + LIGHT.x * 0.6 - state.ry / 26, -0.2, 1.2);
	const hotspotY = clamp(0.5 + LIGHT.y * 0.6 + state.rx / 26, -0.2, 1.2);
	const lightX = clamp(LIGHT.x - state.ry / 22, -1, 1);
	const lightY = clamp(LIGHT.y + state.rx / 22, -1, 1);
	const spark = (x: number, y: number) => clamp(1.15 - Math.hypot(hotspotX - x, hotspotY - y) * 1.6, 0.12, 1).toFixed(2);

	node.style.setProperty('--mx', `${(hotspotX * 100).toFixed(1)}%`);
	node.style.setProperty('--my', `${(hotspotY * 100).toFixed(1)}%`);
	node.style.setProperty('--lx', lightX.toFixed(3));
	node.style.setProperty('--ly', lightY.toFixed(3));
	node.style.setProperty('--ang', `${(200 + state.ry * 9 - state.rx * 6).toFixed(1)}deg`);
	node.style.setProperty('--glare', (state.lift * 0.16).toFixed(3));
	node.style.setProperty('--lift', state.lift.toFixed(3));
	node.style.setProperty('--g1', spark(0.04, 0.03));
	node.style.setProperty('--g2', spark(0.96, 0.97));
	node.style.setProperty('--g3', spark(0.96, 0.4));
	node.style.transform = state.rx || state.ry || state.lift
		? `perspective(900px) rotateX(${state.rx.toFixed(2)}deg) rotateY(${state.ry.toFixed(2)}deg) scale(${(1 + state.lift * 0.025).toFixed(4)})`
		: '';
}

export function tilt(node: HTMLElement, options: TiltOptions = {}) {
	const media = window.matchMedia('(prefers-reduced-motion: reduce)');
	const snapshot = snapshotStyle(node);
	const state: TiltState = { rx: 0, ry: 0, lift: 0 };
	let enabled = options.enabled ?? true;
	let active = false;
	let animation: JSAnimation | undefined;
	let eventTarget = options.eventTarget ?? node;

	const stop = () => {
		animation?.cancel();
		animation = undefined;
	};

	const rest = () => {
		stop();
		state.rx = 0;
		state.ry = 0;
		state.lift = 0;
		restoreStyle(node, snapshot);
	};

	const animateTo = (target: TiltState, duration: number, ease: string) => {
		stop();
		if (media.matches) {
			state.rx = target.rx;
			state.ry = target.ry;
			state.lift = target.lift;
			restoreStyle(node, snapshot);
			return;
		}
		animation = animate(state, {
			...target,
			duration,
			ease,
			onUpdate: () => applyTilt(node, state)
		});
	};

	const onMove = (event: PointerEvent) => {
		if (!enabled || media.matches || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
		const bounds = eventTarget.getBoundingClientRect();
		if (!bounds.width || !bounds.height) return;
		active = true;
		const x = (event.clientX - bounds.left) / bounds.width - 0.5;
		const y = (event.clientY - bounds.top) / bounds.height - 0.5;
		animateTo({ rx: clamp(-y * 2 * MAX_TILT, -MAX_TILT, MAX_TILT), ry: clamp(x * 2 * MAX_TILT, -MAX_TILT, MAX_TILT), lift: 1 }, 420, 'outQuart');
	};

	const onLeave = (event: PointerEvent) => {
		if (!active || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
		active = false;
		animateTo({ rx: 0, ry: 0, lift: 0 }, 900, 'outElastic(1, .6)');
	};

	const onMotionPreferenceChange = () => {
		active = false;
		rest();
		if (media.matches) node.style.transform = '';
	};

	eventTarget.addEventListener('pointermove', onMove);
	eventTarget.addEventListener('pointerleave', onLeave);
	media.addEventListener('change', onMotionPreferenceChange);

	return {
		update(next: TiltOptions = {}) {
			const nextTarget = next.eventTarget ?? node;
			if (nextTarget !== eventTarget) {
				eventTarget.removeEventListener('pointermove', onMove);
				eventTarget.removeEventListener('pointerleave', onLeave);
				eventTarget = nextTarget;
				eventTarget.addEventListener('pointermove', onMove);
				eventTarget.addEventListener('pointerleave', onLeave);
				active = false;
				rest();
			}
			enabled = next.enabled ?? true;
			if (!enabled) {
				active = false;
				rest();
			}
		},
		destroy() {
			eventTarget.removeEventListener('pointermove', onMove);
			eventTarget.removeEventListener('pointerleave', onLeave);
			media.removeEventListener('change', onMotionPreferenceChange);
			rest();
		}
	};
}

export function flip(node: HTMLElement, options: FlipOptions = {}) {
	const media = window.matchMedia('(prefers-reduced-motion: reduce)');
	const snapshot = node.style.transform;
	const state: FlipState = { angle: options.turned ? 180 : 0 };
	let target = state.angle;
	let animation: JSAnimation | undefined;

	const stop = () => {
		animation?.cancel();
		animation = undefined;
	};

	const apply = () => {
		if (media.matches) {
			node.style.transform = '';
			return;
		}
		const lift = Math.sin((Math.PI * state.angle) / 180) * 40;
		node.style.transform = `perspective(1100px) rotateY(${state.angle.toFixed(2)}deg) translateZ(${lift.toFixed(1)}px)`;
	};

	const setTarget = (turned: boolean) => {
		const nextTarget = turned ? 180 : 0;
		if (nextTarget === target) return;
		target = nextTarget;
		stop();
		if (media.matches) {
			state.angle = target;
			apply();
			return;
		}
		animation = animate(state, {
			angle: target,
			duration: 760,
			ease: 'inOutCubic',
			onUpdate: apply
		});
	};

	const onMotionPreferenceChange = () => {
		stop();
		state.angle = target;
		apply();
	};

	apply();
	media.addEventListener('change', onMotionPreferenceChange);

	return {
		update(next: FlipOptions = {}) {
			setTarget(next.turned ?? false);
		},
		destroy() {
			stop();
			media.removeEventListener('change', onMotionPreferenceChange);
			node.style.transform = snapshot;
		}
	};
}
