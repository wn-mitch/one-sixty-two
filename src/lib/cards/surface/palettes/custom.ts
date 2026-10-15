import { definePalette } from '../films/film.ts';

export const MIN_GRADIENT_STOPS = 2;
export const MAX_GRADIENT_STOPS = 5;
export const DEFAULT_CUSTOM_GRADIENT = ['#4a1d78', '#ff4f73', '#53d9d1'] as const;

const RGB_HEX = /^#[0-9a-f]{6}$/i;

/** Whether a value is a complete custom colourway that can safely reach the shader. */
export function isGradient(value: unknown): value is readonly string[] {
	return Array.isArray(value)
		&& value.length >= MIN_GRADIENT_STOPS
		&& value.length <= MAX_GRADIENT_STOPS
		&& value.every(stop => typeof stop === 'string' && RGB_HEX.test(stop));
}

/** Keeps a valid saved gradient, or returns a fresh copy of the shipped custom colourway. */
export function normalizeGradient(value: unknown): string[] {
	return isGradient(value) ? [...value] : [...DEFAULT_CUSTOM_GRADIENT];
}

export type Rgb = readonly [number, number, number];

function rgb(stop: string): Rgb {
	return [
		Number.parseInt(stop.slice(1, 3), 16) / 255,
		Number.parseInt(stop.slice(3, 5), 16) / 255,
		Number.parseInt(stop.slice(5, 7), 16) / 255
	];
}

/** Samples the same evenly-spaced, linear RGB stops used by the shader. */
export function sampleGradient(stops: readonly string[], position: number): Rgb {
	const gradient = isGradient(stops) ? stops : DEFAULT_CUSTOM_GRADIENT;
	const finite = Number.isFinite(position) ? position : 0;
	const at = finite - Math.floor(finite);
	const scaled = at * (gradient.length - 1);
	const lower = Math.min(Math.floor(scaled), gradient.length - 2);
	const mix = scaled - lower;
	const from = rgb(gradient[lower]!);
	const to = rgb(gradient[lower + 1]!);
	return [
		from[0] + (to[0] - from[0]) * mix,
		from[1] + (to[1] - from[1]) * mix,
		from[2] + (to[2] - from[2]) * mix
	];
}

export interface GradientUniforms {
	count: number;
	colors: Float32Array;
}

const uniformCache = new WeakMap<readonly string[], GradientUniforms>();

/** Packs immutable hex stops once for WebGL's fixed-size vec3 array. */
export function gradientUniforms(value: readonly string[] | null | undefined): GradientUniforms {
	const gradient = isGradient(value) ? value : DEFAULT_CUSTOM_GRADIENT;
	const cached = uniformCache.get(gradient);
	if (cached) return cached;
	const colors = new Float32Array(MAX_GRADIENT_STOPS * 3);
	gradient.forEach((stop, index) => colors.set(rgb(stop), index * 3));
	const last = rgb(gradient.at(-1)!);
	for (let index = gradient.length; index < MAX_GRADIENT_STOPS; index++) colors.set(last, index * 3);
	const packed = { count: gradient.length, colors };
	uniformCache.set(gradient, packed);
	return packed;
}

/** Custom: evenly spaced user-authored RGB stops, updated through uniforms. */
export default definePalette({
	name: 'custom',
	glsl: `
	float scaled = fract(t) * float(u_customGradientCount - 1);
	int lower = min(int(floor(scaled)), u_customGradientCount - 2);
	return mix(u_customGradient[lower], u_customGradient[lower + 1], fract(scaled));
`
});
