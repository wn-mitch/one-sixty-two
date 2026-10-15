import { FIN, GEM_RING, GEMHOLO, SILVER } from '../../cards/finish.ts';
import type { CardFinish } from '../../cards/motion.ts';
import type { SeasonGrade } from '../../game/grade.ts';

interface ClubMaterial {
	paint: string;
	motion: CardFinish;
}

/** Season-grade print finishes; player WAR finishes and season thresholds remain independent. */
export const CLUB_MATERIALS = {
	ungraded: { paint: 'var(--stock)', motion: 'base' },
	F: { paint: 'var(--stock)', motion: 'base' },
	D: { paint: 'var(--paper)', motion: 'base' },
	C: { paint: 'linear-gradient(115deg, oklch(58% .09 55), oklch(86% .07 65) 24%, oklch(64% .1 55) 48%, oklch(91% .05 70) 72%, oklch(58% .09 55))', motion: 'silver' },
	B: { paint: SILVER, motion: 'silver' },
	A: { paint: FIN.emboss.stamp, motion: 'gold' },
	AA: { paint: FIN.emboss.stamp, motion: 'gold' },
	S: { paint: GEMHOLO, motion: 'gem' },
	'S+': { paint: GEM_RING, motion: 'gem' },
	Perfect: { paint: FIN.emboss.stamp, motion: 'gem' }
} as const satisfies Record<SeasonGrade | 'ungraded', ClubMaterial>;
