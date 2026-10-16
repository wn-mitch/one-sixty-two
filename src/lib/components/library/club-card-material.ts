import { FIN, GEM_RING, GEMHOLO, SILVER } from '../../cards/finish.ts';
import type { CardFinish } from '../../cards/motion.ts';
import type { SeasonGrade } from '../../game/grade.ts';

interface ClubMaterial {
	paint: string;
	motion: CardFinish;
	/** Finish border width in card units; card controls outside the card align against it. */
	edge: 2 | 3 | 4;
}

/** Season-grade print finishes; player WAR finishes and season thresholds remain independent. */
export const CLUB_MATERIALS = {
	ungraded: { paint: 'var(--stock)', motion: 'base', edge: 2 },
	F: { paint: 'var(--stock)', motion: 'base', edge: 2 },
	D: { paint: 'var(--paper)', motion: 'base', edge: 2 },
	C: { paint: 'linear-gradient(115deg, oklch(58% .09 55), oklch(86% .07 65) 24%, oklch(64% .1 55) 48%, oklch(91% .05 70) 72%, oklch(58% .09 55))', motion: 'silver', edge: 2 },
	B: { paint: SILVER, motion: 'silver', edge: 2 },
	A: { paint: FIN.emboss.stamp, motion: 'gold', edge: 2 },
	AA: { paint: FIN.emboss.stamp, motion: 'gold', edge: 3 },
	S: { paint: GEMHOLO, motion: 'gem', edge: 3 },
	'S+': { paint: GEM_RING, motion: 'gem', edge: 4 },
	Perfect: { paint: FIN.emboss.stamp, motion: 'gem', edge: 4 }
} as const satisfies Record<SeasonGrade | 'ungraded', ClubMaterial>;
