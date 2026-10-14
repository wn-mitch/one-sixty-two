import type { Dial } from '../films/film.ts';

/**
 * A foil plate: a pattern pressed into silver and gold foil. `height` is a GLSL body returning the pattern's height
 * at `p` (card units, already scaled); its slope tilts the metal's normal, so the plate shows as light and shade that
 * move with the card. `shade` optionally returns how much it darkens the metal (x) and tints it (y), and `tint` the
 * colour that tint runs toward. Bodies read their dials by name and `plateStain`, `plateTone` and `footprint`.
 */
export interface Plate {
	name: string;
	/** The pattern's feature size in card units, which sets its slope's scale and where it fades out unresolved. */
	feature: number;
	/** How deep the pattern presses; engraved patterns are shallow, standing lozenges deep. */
	gain?: number;
	/** Multiplies the pattern's size; below 1 is larger. 1 by default. */
	scale?: number;
	params: Record<string, Dial>;
	helpers?: string;
	height?: string;
	shade?: string;
	tint?: string;
}

export function definePlate(plate: Plate): Plate {
	return plate;
}

/** Every dial a plate exposes: its scale and depth, then its own. */
export function plateDials(plate: Plate): Record<string, Dial> {
	return {
		scale: { value: plate.scale ?? 1, min: 0.2, max: 4, step: 0.01, note: 'Pattern size; above 1 is finer.' },
		depth: { value: plate.gain ?? 0.35, min: 0, max: 3, step: 0.01, note: 'How deep the pattern presses.' },
		...plate.params
	};
}
