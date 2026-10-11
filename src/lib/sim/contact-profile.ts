import type { Profile, Rates } from '../game/types.ts';

export const CONTACT_METHOD_VERSION = 'contact-statcast-v1' as const;
/** Conditional contact outcomes in order: 1B, 2B, 3B, HR, OUT (errors are OUT). */
export const CONTACT_OUTCOMES = 5;
export const FIT_TOLERANCE = 1e-4;

/** Histogram bins shared with `scripts/curate-statcast.ts`. */
export interface Bins { min: number; width: number; count: number }
export const SHAPE_BINS = {
 ev: { min: 35, width: 2.5, count: 36 },
 launch: { min: -40, width: 4, count: 32 },
 spray: { min: -45, width: 5, count: 18 }
} as const satisfies Record<string, Bins>;
/** Batted-ball classes by launch angle: GB < 10, LD < 25, FB < 50, PU. */
export const launchClass = (launch: number): number => launch < 10 ? 0 : launch < 25 ? 1 : launch < 50 ? 2 : 3;
export const REGION_COUNT = 12;
export const REGION_LABELS = ['GB', 'LD', 'FB', 'PU'].flatMap(name => [`${name} <85`, `${name} 85-100`, `${name} 100+`]);
/** Power shifts move every sampled exit velocity by this many mph. */
export const POWER_SHIFTS = [-15, -12.5, -10, -7.5, -5, -2.5, 0, 2.5, 5, 7.5, 10, 12.5, 15] as const;
/** Batter speed skill nodes for response interpolation. */
export const SPEED_NODES = [0, 0.25, 0.5, 0.75, 1] as const;
/** Spray sides: left-handed batter, right-handed batter, unknown (equal mixture). */
export const SIDES = ['L', 'R', ''] as const;
export type Side = typeof SIDES[number];
/** Physical outcome classes aggregated for the expectation kernel. */
export const CLASS_COUNT = 44;

/** Cited league shape: 2025 Statcast balls in play. */
export interface ContactShape {
 source: { title: string; url: string; credit: string };
 balls: number;
 /** Counts indexed ev * launch.count + launch. */
 histogram: number[];
 /** Spray counts by batter side and launch class. */
 spray: { L: number[][]; R: number[][] };
}

/** Compiler-built neutral response tables; see `engine/src/contact_basis.rs`. */
export interface ContactBasis {
 /** [side][speed node][shift][region][outcome]. */
 responses: number[];
 /** League physical classes at unknown side and average speed: [shift][region][class]. */
 classes: number[];
}

export interface ContactModel {
 methodVersion: typeof CONTACT_METHOD_VERSION;
 provenance: 'estimated';
 shape: ContactShape;
 basis: ContactBasis;
}

export interface ContactRecord {
 methodVersion: typeof CONTACT_METHOD_VERSION;
 provenance: 'estimated';
 /** Conditional [1B, 2B, 3B, HR, OUT] targets from normalized batting rates. */
 batting: number[] | null;
 /** Conditional [1B, 2B, 3B, HR, OUT] targets from normalized allowed rates. */
 pitching: number[] | null;
}

/** Conditional contact targets [1B, 2B, 3B, HR, OUT] from an eight-event rate vector. */
export function contactTargets(rates: Rates | readonly number[]): number[] {
 const contact = rates[3] + rates[4] + rates[5] + rates[6] + rates[7];
 if (!(contact > 0)) throw new Error('Contact targets require positive contact');
 return [rates[3] / contact, rates[4] / contact, rates[5] / contact, rates[6] / contact, rates[7] / contact];
}

export function contactRecord(profile: Pick<Profile, 'battingRates' | 'pitchingRates'>): ContactRecord {
 return {
  methodVersion: CONTACT_METHOD_VERSION, provenance: 'estimated',
  batting: profile.battingRates ? contactTargets(profile.battingRates) : null,
  pitching: profile.pitchingRates ? contactTargets(profile.pitchingRates) : null
 };
}

/** Effective batting side; switch hitters bat opposite the pitcher. */
export function battingSide(batter: Pick<Profile, 'bats'>, pitcher: Pick<Profile, 'throws'>): Side {
 const side = batter.bats === 'B' ? (pitcher.throws === 'L' ? 'R' : pitcher.throws === 'R' ? 'L' : '') : batter.bats;
 return side === 'L' || side === 'R' ? side : '';
}

const evBand = (speed: number): number => speed < 85 ? 0 : speed < 100 ? 1 : 2;
const regionOf = (evIndex: number, launchIndex: number): number =>
 launchClass(SHAPE_BINS.launch.min + (launchIndex + 0.5) * SHAPE_BINS.launch.width) * 3 + evBand(SHAPE_BINS.ev.min + (evIndex + 0.5) * SHAPE_BINS.ev.width);

/** Rejects a shape the engine cannot sample: every region and spray row must have positive mass. */
export function validateContactShape(shape: ContactShape): void {
 const { ev, launch, spray } = SHAPE_BINS;
 if (!Array.isArray(shape.histogram) || shape.histogram.length !== ev.count * launch.count || shape.histogram.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid contact shape histogram');
 const regionMass = new Float64Array(REGION_COUNT);
 for (let e = 0; e < ev.count; e++) for (let l = 0; l < launch.count; l++) regionMass[regionOf(e, l)] += shape.histogram[e * launch.count + l];
 regionMass.forEach((mass, region) => { if (!(mass > 0)) throw new Error(`Contact shape region ${REGION_LABELS[region]} is empty`); });
 for (const side of ['L', 'R'] as const) for (let launchClassIndex = 0; launchClassIndex < 4; launchClassIndex++) {
  const row = shape.spray?.[side]?.[launchClassIndex];
  if (!row || row.length !== spray.count || row.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid contact shape spray');
  if (!(row.reduce((sum, value) => sum + value, 0) > 0)) throw new Error('Empty contact shape spray');
 }
}
