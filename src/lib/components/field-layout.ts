import type { Slot } from '../game/types.ts';
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
 * The field is a card: a 424×594 face (5:7) with the field window above a nameplate and staff plate.
 * Card art, base positions, and every slot anchor share these units, so cards stay on their positions at every width.
 */
export const FIELD = {
	width: 424,
	height: 594,
	/** Artwork width of a roster card in card units; its height is 7/5 of this. */
	card: 56,
	window: { x: 10, y: 10, width: 404, height: 404 },
	home: { x: 212, y: 350 },
	nameplate: { y: 426, height: 34 },
	/** The compact stadium card, mirroring the DH across home plate. */
	stadium: { x: 46, y: 354 },
	/** Center of each roster card's artwork; the caption hangs below it. */
	slots: {
		LF: { x: 76, y: 76 },
		CF: { x: 212, y: 60 },
		RF: { x: 348, y: 76 },
		SS: { x: 148, y: 160 },
		'2B': { x: 276, y: 160 },
		'3B': { x: 72, y: 240 },
		'1B': { x: 352, y: 240 },
		C: { x: 212, y: 352 },
		DH: { x: 378, y: 354 },
		SP1: { x: 52, y: 508 },
		SP2: { x: 132, y: 508 },
		SP3: { x: 212, y: 508 },
		CL: { x: 292, y: 508 },
		BP: { x: 372, y: 508 }
	}
} as const satisfies {
	width: number;
	height: number;
	card: number;
	window: { x: number; y: number; width: number; height: number };
	home: Point;
	nameplate: { y: number; height: number };
	stadium: Point;
	slots: Record<Slot, Point>;
};

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
export function fieldArt(stadium: StadiumSummary | null | undefined): FieldArt {
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
