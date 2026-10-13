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
	/** One candidate card dropping out the bottom of the screen after a pick. */
	gridDrop: 420,
	/** Gap between consecutive candidate cards leaving, in reading order. */
	gridDropStagger: 30,
	/** A confirmed phone pick pressing into its field slot before the sheet closes. */
	pickStamp: 320,
	/** The next pack rising into place once the candidates have left. */
	packEnter: 460,
	/** How long the pack or dealt card waits untouched before its caption says what to tap. */
	tapHint: 5000,
	/** One idle turn of the franchise-mark coin on a sealed pack. */
	markSpin: 2800,
	/** How many times faster the coin spins while the pack tears and the card pulls. */
	markSpinBurst: 14,
	/** A new screen's sections rising into place after the previous screen hands off. */
	screenRise: 480,
	/** Stadium cards sliding to their new places when a favorite or the sort changes. */
	deckReorder: 320,
	/** Gap between consecutive sections rising, top to bottom. */
	screenRiseStagger: 70,
	/** A card or record travelling from one screen into its place on the next; divided by the card speed setting. */
	handoff: 720,
	/** Gap between consecutive cards in a multi-card handoff. */
	handoffStagger: 35,
	/** How long a departing screen's positions stay valid for the incoming screen to pick up. */
	handoffTtl: 4000,
	/** Raising a roster card for review and returning it; divided by the card speed setting. */
	cardFlight: 780,
	/** Turning the field card between the field and its stadium details. */
	fieldFlip: 640,
	/** A field card sliding between slots: base plus distance, capped; divided by the card speed setting. */
	fieldSlide: { base: 360, perPixel: .8, max: 700 },
	/** A sort or filter change scooping the leaving candidate cards into one pile. */
	gather: 380,
	/** Gap between consecutive cards scooped up or rising in after a sort or filter change. */
	gatherStagger: 22,
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
