/**
 * Shared motion timing for cards and the draft deal.
 * CSS reads the `CSS_MOTION` entries as custom properties declared in `src/routes/layout.css`;
 * `motion-timing.test.ts` fails if the two drift.
 */

/** Fast start, long settle: flips, deals, raises, and the rail's growth. */
export const EASE_OUT = 'cubic-bezier(.16, 1, .3, 1)';
/** Symmetric: things leaving the stage, such as the emptied pack. */
export const EASE_IN_OUT = 'cubic-bezier(.55, 0, .45, 1)';
/** Gentle start for cards travelling between field slots. */
export const EASE_SLIDE = 'cubic-bezier(.45, .05, .25, 1)';

/** Durations in milliseconds. */
export const MOTION = {
	/** The deal's tempo: the dealt card's flip, its slide into the rail, and the rail's sideways growth. */
	deal: 600,
	/** Point in the slide, as a fraction of `deal`, where the rail starts growing the franchise and era. */
	dealHandoff: .22,
	packTear: 360,
	cardRise: 420,
	packDrop: 640,
	dealSettle: 520,
	/**
	 * Point in the slide, as a fraction of `deal`, where the candidate grid starts dealing out.
	 * The eased slide has landed and mostly faded by then; waiting for the full fade leaves a dead beat.
	 */
	dealOutLead: .45,
	/** One candidate card flying from the dealt team card into its grid slot. */
	dealOut: 560,
	/** Gap between consecutive candidate cards in the deal, in reading order. */
	dealStagger: 45,
	/** Cards beyond this many on screen skip the flight so the deal never drags. */
	dealMaxCards: 12,
	/** Raising a roster card for review and returning it; divided by the card speed setting. */
	cardFlight: 780,
	/** Turning the field card between the field and its stadium details. */
	fieldFlip: 640,
	/** A field card sliding between slots: base plus distance, capped; divided by the card speed setting. */
	fieldSlide: { base: 360, perPixel: .8, max: 700 },
	gridExit: 180,
	gridMove: 320,
	gridEnter: 240,
	rowShift: 180,
	rowSettle: 260
} as const;

/** Custom properties CSS uses for the same timings. */
export const CSS_MOTION = {
	'--ease-out': EASE_OUT,
	'--motion-deal': `${MOTION.deal}ms`,
	'--motion-field-flip': `${MOTION.fieldFlip}ms`
} as const;
