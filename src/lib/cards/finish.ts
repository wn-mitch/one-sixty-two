export type Finish = 'base' | 'foil' | 'emboss' | 'gem';
export type FinishRole = 'hitter' | 'starter' | 'closer' | 'bullpen';

export interface FinishMaterial {
	tier: Finish;
	label: string;
	foil: boolean;
	emboss: boolean;
	gem: boolean;
	stamp: string;
	emb: string;
}

export const HITTER_STARTER_CUTS = Object.freeze([2, 4, 6] as const);
export const CLOSER_CUTS = Object.freeze([0.5, 1.5, 2.5] as const);

const SILVER = 'linear-gradient(115deg, #8f99a4 0%, #f4f6f8 16%, #aeb7c0 30%, #ffffff 44%, #a3adb7 58%, #e9edf1 74%, #8a949f 100%) var(--mx) var(--my) / 300% 300%';
const GOLD = 'linear-gradient(115deg, #9a6c22 0%, #f7df9a 15%, #c4953a 29%, #fff3c8 43%, #b5832d 57%, #f2d58a 73%, #8f6420 100%) var(--mx) var(--my) / 300% 300%';
const GEMHOLO = 'linear-gradient(115deg, #ffd0ee 0%, #ffffff 9%, #8fe6ff 19%, #ffe07a 30%, #a8ffc0 41%, #e2b0ff 52%, #ffffff 62%, #ffc2a8 74%, #9fe0ff 87%, #ffd0ee 100%) var(--mx) var(--my) / 300% 300%';
const EMB = 'calc(var(--lx) * 0.22cqw) calc(var(--ly) * 0.22cqw) 0 rgba(255,255,255,0.5), calc(var(--lx) * -0.32cqw) calc(var(--ly) * -0.32cqw) 0.18cqw rgba(0,0,0,0.5)';

export const FIN = Object.freeze({
	base: Object.freeze({ tier: 'base', label: 'Base', foil: false, emboss: false, gem: false, stamp: 'initial', emb: 'initial' }),
	foil: Object.freeze({ tier: 'foil', label: 'Foil', foil: true, emboss: false, gem: false, stamp: SILVER, emb: 'initial' }),
	emboss: Object.freeze({ tier: 'emboss', label: 'Foil + emboss', foil: true, emboss: true, gem: false, stamp: GOLD, emb: EMB }),
	gem: Object.freeze({ tier: 'gem', label: 'Gem', foil: true, emboss: true, gem: true, stamp: GEMHOLO, emb: EMB })
} satisfies Record<Finish, FinishMaterial>);

export function materialFor(finish: Finish): Readonly<FinishMaterial> {
	return FIN[finish];
}

/**
 * Selects the cosmetic card material. It intentionally has no simulation inputs
 * or side effects. A two-way individual uses the higher finite WAR value.
 */
export function finishFor(
	role: FinishRole,
	battingWar: number | null | undefined,
	pitchingWar: number | null | undefined
): Finish {
	if (role === 'bullpen') return 'base';

	const hasBattingWar = typeof battingWar === 'number' && Number.isFinite(battingWar);
	const hasPitchingWar = typeof pitchingWar === 'number' && Number.isFinite(pitchingWar);
	if (!hasBattingWar && !hasPitchingWar) return 'base';

	const war = Math.max(hasBattingWar ? battingWar : -Infinity, hasPitchingWar ? pitchingWar : -Infinity);
	const [foil, emboss, gem] = role === 'closer' ? CLOSER_CUTS : HITTER_STARTER_CUTS;
	if (war >= gem) return 'gem';
	if (war >= emboss) return 'emboss';
	return war >= foil ? 'foil' : 'base';
}
