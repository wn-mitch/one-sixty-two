import type { CardSlot } from '../game/types.ts';
import type { StadiumSummary } from '../sim/park-types.ts';

export interface Point { x: number; y: number }

const BASE_M = 27.432;
const MOUND_M = 18.44;
/** Radial exponent: distances compress toward the fence so the infield has room for cards. */
const POWER = .667;
/** Card units per projected meter; a smaller value is used when a park would overflow the window. */
const SCALE = 12.2;
/** A symmetric 330/400 park for fields drawn before a stadium is chosen. */
const FALLBACK_OUTLINE: readonly (readonly [number, number])[] = Array.from({ length: 19 }, (_, index) => {
	const bearing = -45 + index * 5;
	const depth = 100.6 + (121.9 - 100.6) * Math.cos((bearing * Math.PI) / 90);
	const radians = (bearing * Math.PI) / 180;
	return [depth * Math.sin(radians), depth * Math.cos(radians)] as const;
});

/**
 * The field is a card: a 424-unit-wide face with the field window above a staff plate holding the
 * rotation and closer above the other relievers. The stadium card in the third-base corner names the park.
 * Card art, base positions, and every slot anchor share these units, so cards stay on their positions at every width.
 */
export const FIELD = {
	width: 424,
	height: 678,
	/** Artwork width of a roster card in card units; its height is 7/5 of this. */
	card: 56,
	window: { x: 10, y: 10, width: 404, height: 404 },
	home: { x: 212, y: 350 },
	/** The compact stadium card in the third-base corner, mirroring the DH across home plate. */
	stadium: { x: 46, y: 344 },
	/** Two rows of staff cards, each with room for a two-line name and its slot · year line. */
	staffPlate: { y: 422, height: 246 },
	/** Center of each roster card's artwork; the caption hangs below it. */
	slots: {
		LF: { x: 76, y: 76 },
		CF: { x: 212, y: 60 },
		RF: { x: 348, y: 76 },
		SS: { x: 148, y: 160 },
		'2B': { x: 276, y: 160 },
		// The corners sit high enough that their two-line captions clear the DH and stadium cards below them.
		'3B': { x: 72, y: 220 },
		'1B': { x: 352, y: 220 },
		C: { x: 212, y: 342 },
		DH: { x: 378, y: 344 },
		// The rotation and the closer share the top row's four columns, 101 units apart; the other relievers sit centered below.
		SP1: { x: 60.5, y: 466 },
		SP2: { x: 161.5, y: 466 },
		SP3: { x: 262.5, y: 466 },
		CL: { x: 363.5, y: 466 },
		RP1: { x: 111, y: 587 },
		RP2: { x: 212, y: 587 },
		RP3: { x: 313, y: 587 },
		/** Draft Mode's deep relievers, in the five-across relief row (`DEEP_RELIEF`). */
		RP4: { x: 292.8, y: 587 },
		RP5: { x: 373.6, y: 587 },
		/** Older saved seasons drafted a team bullpen; it takes the first relief spot. */
		BP: { x: 111, y: 587 }
	}
} as const satisfies {
	width: number;
	height: number;
	card: number;
	window: { x: number; y: number; width: number; height: number };
	home: Point;
	stadium: Point;
	staffPlate: { y: number; height: number };
	slots: Record<CardSlot, Point>;
};

/** Draft Mode's relief row: five relievers spread evenly across the staff plate's width, 80.8 units apart. */
const DEEP_RELIEF: Partial<Record<CardSlot, Point>> = {
	RP1: { x: 50.4, y: 587 },
	RP2: { x: 131.2, y: 587 },
	RP3: { x: 212, y: 587 },
	RP4: FIELD.slots.RP4,
	RP5: FIELD.slots.RP5
};

/** Where `slot`'s card sits; `deep` rosters carry RP4 and RP5, so their relievers share a five-across row. */
export const slotPoint = (slot: CardSlot, deep = false): Point => (deep ? DEEP_RELIEF[slot] : undefined) ?? FIELD.slots[slot];

export interface FieldArt {
	/** Fair territory from home around the fence, as an SVG points list. */
	fair: string;
	infieldDirt: string;
	infieldGrass: string;
	foulLines: string;
	bases: Point[];
	home: Point;
	mound: Point;
	/** Whether the outline is the stadium's measured one rather than a generic park. */
	measured: boolean;
}

const pointList = (points: Point[]) => points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');

/** Projects field meters (x toward the first-base side, y away from home) into card units around home plate. */
function projector(outline: readonly (readonly [number, number])[]): (x: number, y: number) => Point {
	const { home, window } = FIELD;
	const room = { up: home.y - window.y - 14, side: Math.min(home.x - window.x, window.x + window.width - home.x) - 10 };
	let scale = SCALE;
	for (const [x, y] of outline) {
		const radius = Math.hypot(x, y) ** POWER;
		const bearing = Math.atan2(x, y);
		if (Math.cos(bearing) > 0) scale = Math.min(scale, room.up / (radius * Math.cos(bearing)));
		if (Math.sin(bearing) !== 0) scale = Math.min(scale, room.side / (radius * Math.abs(Math.sin(bearing))));
	}
	return (x, y) => {
		const radius = scale * Math.hypot(x, y) ** POWER;
		const bearing = Math.atan2(x, y);
		return { x: home.x + radius * Math.sin(bearing), y: home.y - radius * Math.cos(bearing) };
	};
}

/** Field artwork for a stadium's measured outline, or a generic symmetric park when none is chosen. */
export function fieldArt(stadium: Pick<StadiumSummary, 'outline'> | null | undefined): FieldArt {
	const outline = stadium?.outline.length ? stadium.outline : FALLBACK_OUTLINE;
	const project = projector(outline);
	const diagonal = BASE_M / Math.SQRT2;
	const home = project(0, 0);
	const bases = [project(diagonal, diagonal), project(0, 2 * diagonal), project(-diagonal, diagonal)];
	const arc = Array.from({ length: 19 }, (_, index) => {
		const bearing = ((-45 + index * 5) * Math.PI) / 180;
		return project(39 * Math.sin(bearing), 39 * Math.cos(bearing));
	});
	const fence = outline.map(([x, y]) => project(x, y));
	return {
		fair: pointList([home, ...fence]),
		infieldDirt: pointList([home, ...arc]),
		infieldGrass: pointList([home, bases[0], bases[1], bases[2]]),
		foulLines: pointList([fence[0], home, fence.at(-1)!]),
		bases,
		home,
		mound: project(0, MOUND_M),
		measured: Boolean(stadium?.outline.length)
	};
}
