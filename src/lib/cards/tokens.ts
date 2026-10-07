export const PAPER = '#f6f7f5';
export const INK = '#14171c';
export const STOCK = '#e7ebed';
export const DARK = '#0f1115';
export const KRAFT = '#d8ccb6';

type Rgb = readonly [number, number, number];

export interface TeamColors {
	primary: string;
	secondary: string;
}

export interface Roles {
	kraft: string;
	fieldOnKraft: string;
	/** Decorative 1970s display ink; it is permitted to use the 3:1 display threshold. */
	accentOnKraft: string;
	kraftRow: string;
	field: string;
	onField: string;
	accent: string;
	onAccent: string;
	echo: string;
	paper: string;
	ink: string;
	stock: string;
	fieldOnPaper: string;
	fieldOnStock: string;
	accentOnStock: string;
	/** 1970s headline display ink; normal-size text must use a 4.5:1 role instead. */
	display: string;
	dark: string;
	raised: string;
	/** Normal photo-placeholder ink against the raised ground and its light stripes. */
	onRaised: string;
	tintOnDark: string;
	mutedOnDark: string;
	stripe: string;
	stripeOnField: string;
}

function rgb(color: string): Rgb {
	const hex = color.startsWith('#') ? color.slice(1) : color;
	if (!/^[\da-fA-F]{6}$/.test(hex)) throw new TypeError(`Expected a six-digit hex color, received ${color}`);

	return [
		Number.parseInt(hex.slice(0, 2), 16),
		Number.parseInt(hex.slice(2, 4), 16),
		Number.parseInt(hex.slice(4, 6), 16)
	];
}

function hex(channels: readonly number[]): string {
	return `#${channels
		.map((channel) => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, '0'))
		.join('')}`;
}

function luminance(color: string): number {
	return rgb(color)
		.map((channel) => {
			const value = channel / 255;
			return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
		})
		.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

/** Mixes two archive palette colors in sRGB space. */
export function mix(from: string, to: string, amount: number): string {
	const source = rgb(from);
	const target = rgb(to);
	return hex(source.map((channel, index) => channel + (target[index] - channel) * amount));
}

/** WCAG relative-luminance contrast ratio. */
export function contrast(first: string, second: string): number {
	const firstLuminance = luminance(first);
	const secondLuminance = luminance(second);
	return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

/** Moves a color toward a target in archive 5% steps until it reaches the requested contrast. */
export function toward(color: string, target: string, background: string, minimum: number): string {
	let amount = 0;
	let adjusted = color;
	while (contrast(adjusted, background) < minimum && amount < 1) {
		amount += 0.05;
		adjusted = mix(color, target, amount);
	}
	return adjusted;
}

/** Derives the semantic archive color roles for a franchise palette. */
export function roles(team: TeamColors): Roles {
	const field = team.primary;
	const accent = team.secondary;
	function on(color: string): string {
		const paperContrast = contrast(color, PAPER);
		if (paperContrast >= 4.5) return PAPER;
		const inkContrast = contrast(color, INK);
		if (inkContrast >= 4.5) return INK;
		return paperContrast > inkContrast
			? toward(PAPER, '#ffffff', color, 4.5)
			: toward(INK, '#000000', color, 4.5);
	}
	const onField = on(field);
	const onAccent = on(accent);
	const dark = mix(field, DARK, 0.86);
	const raised = mix(field, '#22262d', 0.78);
	const lightForeground = contrast(onField, INK) > contrast(onField, PAPER);
	let echo: string;
	if (contrast(accent, field) >= 1.6 && contrast(accent, onField) >= 1.6) {
		echo = accent;
	} else if (!lightForeground) {
		echo = PAPER;
	} else {
		echo = mix(field, INK, 0.55);
	}

	return {
		kraft: KRAFT,
		fieldOnKraft: toward(field, INK, KRAFT, 4.5),
		accentOnKraft: toward(accent, INK, KRAFT, 3),
		kraftRow: 'rgba(255,255,255,.42)',
		field,
		onField,
		accent,
		onAccent,
		echo,
		paper: PAPER,
		ink: INK,
		stock: STOCK,
		fieldOnPaper: toward(field, INK, PAPER, 4.5),
		fieldOnStock: toward(field, INK, STOCK, 4.5),
		accentOnStock: toward(accent, INK, STOCK, 4.5),
		display: toward(field, INK, STOCK, 3),
		dark,
		raised,
		onRaised: toward('#b9c0ca', PAPER, mix(raised, '#ffffff', 0.07), 4.5),
		tintOnDark: toward(field, PAPER, dark, 4.5),
		mutedOnDark: '#b9c0ca',
		stripe: `rgba(${rgb(field).join(',')},.24)`,
		stripeOnField: lightForeground ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.11)'
	};
}
