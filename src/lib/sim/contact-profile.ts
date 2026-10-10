import type { Profile, Rates } from '../game/types.ts';
import { carryAt } from './flight.ts';
import { normalQuantile } from './normal.ts';
import { matchupRates, normalize } from './rates.ts';

export const CONTACT_METHOD_VERSION = 'contact-statcast-v1' as const;
/** Conditional contact outcomes in order: 1B, 2B, 3B, HR, OUT (errors are OUT). */
export const CONTACT_OUTCOMES = 5;
export const FIT_TOLERANCE = 1e-4;
/** Uniforms consumed from the contact stream per contact sample. */
export const CONTACT_UNIFORMS = 7;

/** Histogram bins shared with `scripts/curate-statcast.ts`. */
export interface Bins { min: number; width: number; count: number }
export const SHAPE_BINS = {
 ev: { min: 35, width: 2.5, count: 36 },
 launch: { min: -40, width: 4, count: 32 },
 spray: { min: -45, width: 5, count: 18 }
} as const satisfies Record<string, Bins>;
/** Batted-ball classes by launch angle: GB < 10, LD < 25, FB < 50, PU. */
export const launchClass = (launch: number): number => launch < 10 ? 0 : launch < 25 ? 1 : launch < 50 ? 2 : 3;
/** Exit-velocity bands within each class: < 85, 85-100, >= 100 mph. */
const evBand = (speed: number): number => speed < 85 ? 0 : speed < 100 ? 1 : 2;
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

/** Compiler-built neutral response tables; see `contact-basis.ts`. */
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

export const regionOf = (evIndex: number, launchIndex: number): number =>
 launchClass(SHAPE_BINS.launch.min + (launchIndex + 0.5) * SHAPE_BINS.launch.width) * 3 + evBand(SHAPE_BINS.ev.min + (evIndex + 0.5) * SHAPE_BINS.ev.width);

/** Immutable sampling tables derived from the shape. */
export interface ShapeTables {
 /** Region share of league contact. */
 regionShare: Float64Array;
 /** Per region, CDF over histogram cells (ev * launch.count + launch). */
 cellCdf: Float64Array[];
 cells: Int32Array[];
 /** [side][launch class] CDF over spray bins. */
 sprayCdf: Float64Array[];
}

const TABLES = new WeakMap<ContactShape, ShapeTables>();
export function shapeTables(shape: ContactShape): ShapeTables {
 const cached = TABLES.get(shape);
 if (cached) return cached;
 const { ev, launch, spray } = SHAPE_BINS;
 if (shape.histogram.length !== ev.count * launch.count || shape.histogram.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid contact shape histogram');
 const total = shape.histogram.reduce((sum, value) => sum + value, 0);
 if (!(total > 0)) throw new Error('Empty contact shape');
 const regionShare = new Float64Array(REGION_COUNT);
 const regionCells: number[][] = Array.from({ length: REGION_COUNT }, () => []);
 for (let e = 0; e < ev.count; e++) for (let l = 0; l < launch.count; l++) {
  const cell = e * launch.count + l;
  if (shape.histogram[cell] === 0) continue;
  const region = regionOf(e, l);
  regionShare[region] += shape.histogram[cell] / total;
  regionCells[region].push(cell);
 }
 const cellCdf: Float64Array[] = [];
 const cells: Int32Array[] = [];
 for (let region = 0; region < REGION_COUNT; region++) {
  const list = regionCells[region];
  if (!list.length) throw new Error(`Contact shape region ${REGION_LABELS[region]} is empty`);
  const regionTotal = list.reduce((sum, cell) => sum + shape.histogram[cell], 0);
  const cdf = new Float64Array(list.length);
  let cumulative = 0;
  list.forEach((cell, index) => { cumulative += shape.histogram[cell] / regionTotal; cdf[index] = cumulative; });
  cdf[list.length - 1] = 1;
  cellCdf.push(cdf);
  cells.push(Int32Array.from(list));
 }
 const sprayCdf: Float64Array[] = [];
 for (const side of SIDES) for (let launchClassIndex = 0; launchClassIndex < 4; launchClassIndex++) {
  const counts = new Float64Array(spray.count);
  for (const source of side === '' ? (['L', 'R'] as const) : [side]) {
   const row = shape.spray[source]?.[launchClassIndex];
   if (!row || row.length !== spray.count || row.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid contact shape spray');
   const rowTotal = row.reduce((sum, value) => sum + value, 0);
   if (!(rowTotal > 0)) throw new Error('Empty contact shape spray');
   for (let index = 0; index < spray.count; index++) counts[index] += row[index] / rowTotal;
  }
  let cumulative = 0;
  const totalSpray = counts.reduce((sum, value) => sum + value, 0);
  const cdf = new Float64Array(spray.count);
  for (let index = 0; index < spray.count; index++) { cumulative += counts[index] / totalSpray; cdf[index] = cumulative; }
  cdf[spray.count - 1] = 1;
  sprayCdf.push(cdf);
 }
 const tables = { regionShare, cellCdf, cells, sprayCdf };
 TABLES.set(shape, tables);
 return tables;
}

export const sideIndex = (side: Side): number => side === 'L' ? 0 : side === 'R' ? 1 : 2;

function search(cdf: Float64Array, uniform: number): number {
 let low = 0, high = cdf.length - 1;
 while (low < high) {
  const mid = (low + high) >>> 1;
  if (uniform < cdf[mid]) high = mid;
  else low = mid + 1;
 }
 return low;
}

export interface ContactDraw { region: number; speedMph: number; launchDeg: number; sprayDeg: number; carry: number }

/** Continuous draw: region, histogram cell, uniform position within it, a side-specific spray, then carry. */
export function drawContact(tables: ShapeTables, regionCdf: Float64Array, regionOffset: number, shift: number, side: Side, uniforms: Float64Array, output: ContactDraw): ContactDraw {
 let region = 0;
 while (region < REGION_COUNT - 1 && uniforms[0] >= regionCdf[regionOffset + region]) region++;
 const cell = tables.cells[region][search(tables.cellCdf[region], uniforms[1])];
 const { ev, launch, spray } = SHAPE_BINS;
 const e = Math.floor(cell / launch.count);
 const l = cell - e * launch.count;
 output.region = region;
 output.speedMph = ev.min + (e + uniforms[2]) * ev.width + shift;
 output.launchDeg = launch.min + (l + uniforms[3]) * launch.width;
 const sprayBin = search(tables.sprayCdf[sideIndex(side) * 4 + launchClass(output.launchDeg)], uniforms[4]);
 output.sprayDeg = spray.min + (sprayBin + uniforms[5]) * spray.width;
 output.carry = carryAt(normalQuantile(Math.max(Number.MIN_VALUE, uniforms[6])));
 return output;
}

const speedPosition = (speed: number): [number, number] => {
 if (!Number.isFinite(speed) || speed < 0 || speed > 1) throw new Error('Invalid batter speed');
 const scaled = speed * (SPEED_NODES.length - 1);
 const low = Math.min(SPEED_NODES.length - 2, Math.floor(scaled));
 return [low, scaled - low];
};

/** Region responses [region][outcome] for a side, batter speed, and shift node. */
export function regionResponses(basis: ContactBasis, side: Side, speed: number, shiftIndex: number, output: Float64Array): void {
 const [low, fraction] = speedPosition(speed);
 const stride = POWER_SHIFTS.length * REGION_COUNT * CONTACT_OUTCOMES;
 const base = sideIndex(side) * SPEED_NODES.length * stride + shiftIndex * REGION_COUNT * CONTACT_OUTCOMES;
 for (let index = 0; index < REGION_COUNT * CONTACT_OUTCOMES; index++) {
  output[index] = (1 - fraction) * basis.responses[base + low * stride + index] + fraction * basis.responses[base + (low + 1) * stride + index];
 }
}

/** Solves the small symmetric positive-definite system in place (Gaussian elimination, partial pivoting). */
function solve(matrix: Float64Array, rhs: Float64Array, size: number): boolean {
 for (let column = 0; column < size; column++) {
  let pivot = column;
  for (let row = column + 1; row < size; row++) if (Math.abs(matrix[row * size + column]) > Math.abs(matrix[pivot * size + column])) pivot = row;
  if (!(Math.abs(matrix[pivot * size + column]) > 1e-300)) return false;
  if (pivot !== column) {
   for (let k = 0; k < size; k++) { const swap = matrix[column * size + k]; matrix[column * size + k] = matrix[pivot * size + k]; matrix[pivot * size + k] = swap; }
   const swap = rhs[column]; rhs[column] = rhs[pivot]; rhs[pivot] = swap;
  }
  for (let row = column + 1; row < size; row++) {
   const factor = matrix[row * size + column] / matrix[column * size + column];
   if (factor === 0) continue;
   for (let k = column; k < size; k++) matrix[row * size + k] -= factor * matrix[column * size + k];
   rhs[row] -= factor * rhs[column];
  }
 }
 for (let row = size - 1; row >= 0; row--) {
  let value = rhs[row];
  for (let k = row + 1; k < size; k++) value -= matrix[row * size + k] * rhs[k];
  rhs[row] = value / matrix[row * size + row];
 }
 return true;
}

interface NnlsScratch {
 rows: number; cols: number;
 passive: Uint8Array; gradient: Float64Array; z: Float64Array; normal: Float64Array; rhs: Float64Array;
 index: Int32Array; residual: Float64Array; gram: Float64Array; projection: Float64Array;
}
let scratch: NnlsScratch | null = null;

/** Reused work buffers; every buffer is fully written before it is read within one solve. */
function nnlsScratch(rows: number, cols: number): NnlsScratch {
 if (scratch?.rows !== rows || scratch.cols !== cols) {
  scratch = {
   rows, cols,
   passive: new Uint8Array(cols), gradient: new Float64Array(cols), z: new Float64Array(cols), normal: new Float64Array(cols * cols),
   rhs: new Float64Array(cols), index: new Int32Array(cols), residual: new Float64Array(rows),
   gram: new Float64Array(cols * cols), projection: new Float64Array(cols)
  };
 }
 return scratch;
}

/**
 * Lawson-Hanson non-negative least squares for min ||A x - b|| with x >= 0 (A is rows x cols, row-major).
 * The passive-set normal equations are gathered from AᵀA and Aᵀb, computed once per call.
 */
export function nnls(a: Float64Array, b: Float64Array, rows: number, cols: number, x: Float64Array): void {
 x.fill(0);
 const { passive, gradient, z, normal, rhs, index, residual, gram, projection } = nnlsScratch(rows, cols);
 passive.fill(0);
 for (let i = 0; i < cols; i++) {
  let value = 0;
  for (let row = 0; row < rows; row++) value += a[row * cols + i] * b[row];
  projection[i] = value;
  for (let j = i; j < cols; j++) {
   let entry = 0;
   for (let row = 0; row < rows; row++) entry += a[row * cols + i] * a[row * cols + j];
   gram[i * cols + j] = entry;
   gram[j * cols + i] = entry;
  }
 }
 for (let outer = 0; outer < 3 * cols; outer++) {
  for (let row = 0; row < rows; row++) {
   let value = b[row];
   for (let col = 0; col < cols; col++) value -= a[row * cols + col] * x[col];
   residual[row] = value;
  }
  let best = -1, bestValue = 1e-12;
  for (let col = 0; col < cols; col++) {
   let value = 0;
   for (let row = 0; row < rows; row++) value += a[row * cols + col] * residual[row];
   gradient[col] = value;
   if (!passive[col] && value > bestValue) { bestValue = value; best = col; }
  }
  if (best < 0) return;
  passive[best] = 1;
  for (let inner = 0; inner < 3 * cols; inner++) {
   let size = 0;
   for (let col = 0; col < cols; col++) if (passive[col]) index[size++] = col;
   for (let i = 0; i < size; i++) {
    rhs[i] = projection[index[i]];
    for (let j = 0; j < size; j++) normal[i * size + j] = gram[index[i] * cols + index[j]];
   }
   if (!solve(normal, rhs, size)) throw new Error('Contact fit normal equations are singular');
   z.fill(0);
   for (let i = 0; i < size; i++) z[index[i]] = rhs[i];
   let feasible = true;
   for (let i = 0; i < size; i++) if (z[index[i]] <= 0) feasible = false;
   if (feasible) { x.set(z); break; }
   let alpha = Infinity;
   for (let i = 0; i < size; i++) {
    const col = index[i];
    if (z[col] <= 0) alpha = Math.min(alpha, x[col] / (x[col] - z[col]));
   }
   for (let col = 0; col < cols; col++) {
    x[col] += alpha * (z[col] - x[col]);
    if (passive[col] && x[col] <= 1e-15) { passive[col] = 0; x[col] = 0; }
   }
  }
 }
}

/** Relative equation weight; each binding row is scaled by its target so rare outcomes still bind. */
const EQUATION_WEIGHT = 1e4;
const PRIOR_WEIGHT = 1;
/** Triples are best-effort: no region's neutral triple rate approaches historical triple leaders. */
const TRIPLE_WEIGHT = 2;
/** Fit rows: singles, extra-base non-home-run hits (2B + 3B), triples, home runs, outs. */
const FIT_ROWS = CONTACT_OUTCOMES;
const rowValue = (values: ArrayLike<number>, offset: number, row: number): number =>
 row === 1 ? values[offset + 1] + values[offset + 2] : row === 2 ? values[offset + 2] : values[offset + row];

const shiftPenalty = (shiftIndex: number): number => (POWER_SHIFTS[shiftIndex] / 10) ** 2;
/** Shift nodes by ascending penalty; ties in score still go to the lower index. */
const SHIFT_SEARCH_ORDER = POWER_SHIFTS.map((_, index) => index).sort((left, right) => shiftPenalty(left) - shiftPenalty(right) || left - right);

/** `error` covers the binding rows (1B, 2B + 3B, HR, OUT); `tripleError` is the best-effort split. */
export interface ContactFit { regionWeights: Float64Array; shiftIndex: number; error: number; tripleError: number }

/**
 * Chooses a power-shift node and region weights whose neutral-park outcomes reproduce `target`,
 * preferring weights close to `prior` (the league region shares) and small shifts. Singles,
 * doubles plus triples, home runs, and outs are matched within FIT_TOLERANCE where any shift
 * allows it; otherwise the closest fit is returned with its `error` (the compiler reports these).
 * The split between doubles and triples is matched as closely as the physical regions allow.
 */
export function fitContact(basis: ContactBasis, prior: Float64Array, target: readonly number[], side: Side, speed: number, label: string): ContactFit {
 if (target.length !== CONTACT_OUTCOMES || target.some(value => !Number.isFinite(value) || value < 0) || Math.abs(target.reduce((sum, value) => sum + value, 0) - 1) > 1e-9) {
  throw new Error(`Invalid contact target: ${label}`);
 }
 const responses = new Float64Array(REGION_COUNT * CONTACT_OUTCOMES);
 const rows = CONTACT_OUTCOMES + 1 + REGION_COUNT;
 const a = new Float64Array(rows * REGION_COUNT);
 const b = new Float64Array(rows);
 const weights = new Float64Array(REGION_COUNT);
 let best: ContactFit | null = null;
 let bestScore = Infinity;
 for (const shiftIndex of SHIFT_SEARCH_ORDER) {
  // Every score is at least its shift penalty, so a larger penalty cannot win.
  if (shiftPenalty(shiftIndex) > bestScore) continue;
  regionResponses(basis, side, speed, shiftIndex, responses);
  a.fill(0);
  for (let row = 0; row < FIT_ROWS; row++) {
   const goal = rowValue(target, 0, row);
   const scale = row === 2 ? TRIPLE_WEIGHT / Math.max(goal, 0.005) : EQUATION_WEIGHT / Math.max(goal, 0.005);
   for (let region = 0; region < REGION_COUNT; region++) a[row * REGION_COUNT + region] = scale * rowValue(responses, region * CONTACT_OUTCOMES, row);
   b[row] = scale * goal;
  }
  for (let region = 0; region < REGION_COUNT; region++) a[CONTACT_OUTCOMES * REGION_COUNT + region] = EQUATION_WEIGHT * 20;
  b[CONTACT_OUTCOMES] = EQUATION_WEIGHT * 20;
  for (let region = 0; region < REGION_COUNT; region++) {
   a[(CONTACT_OUTCOMES + 1 + region) * REGION_COUNT + region] = PRIOR_WEIGHT / Math.sqrt(Math.max(prior[region], 1e-4));
   b[CONTACT_OUTCOMES + 1 + region] = PRIOR_WEIGHT * prior[region] / Math.sqrt(Math.max(prior[region], 1e-4));
  }
  nnls(a, b, rows, REGION_COUNT, weights);
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) continue;
  for (let region = 0; region < REGION_COUNT; region++) weights[region] /= total;
  let error = 0, tripleError = 0, distance = 0;
  for (let row = 0; row < FIT_ROWS; row++) {
   let predicted = 0;
   for (let region = 0; region < REGION_COUNT; region++) predicted += weights[region] * rowValue(responses, region * CONTACT_OUTCOMES, row);
   const miss = Math.abs(predicted - rowValue(target, 0, row));
   if (row === 2) tripleError = miss;
   else error = Math.max(error, miss);
  }
  for (let region = 0; region < REGION_COUNT; region++) distance += (weights[region] - prior[region]) ** 2 / Math.max(prior[region], 1e-4);
  const score = (error <= FIT_TOLERANCE ? 0 : 1e6 * error) + 1e3 * tripleError + distance + shiftPenalty(shiftIndex);
  if (score < bestScore || (score === bestScore && best !== null && shiftIndex < best.shiftIndex)) {
   bestScore = score;
   best = { regionWeights: Float64Array.from(weights), shiftIndex, error, tripleError };
  }
 }
 if (!best) throw new Error(`Contact fit failed for ${label}`);
 return best;
}

/** Neutral eight-event matchup with platoon adjustment; venues act later through flight. */
export function matchup(batter: Profile, pitcher: Profile, league: Rates): Rates {
 if (!batter.battingRates || !pitcher.pitchingRates) throw new Error('Matchup requires batting and pitching rates');
 const weights = matchupRates(batter.battingRates, pitcher.pitchingRates, league);
 const side = battingSide(batter, pitcher);
 const known = side !== '' && (pitcher.throws === 'L' || pitcher.throws === 'R');
 const same = side === pitcher.throws;
 const hitAndWalk = known ? same ? 0.95 : 1.025 : 1;
 const strikeout = known ? same ? 1.05 : 0.975 : 1;
 weights[0] *= hitAndWalk;
 weights[2] *= strikeout;
 for (let event = 3; event <= 6; event++) weights[event] *= hitAndWalk;
 return normalize(weights);
}

/** League region prior: the league-average matchup fitted from the raw 2025 region shares. */
const LEAGUE_FITS = new WeakMap<ContactModel, Map<string, ContactFit>>();
export function leagueContactFit(model: ContactModel, league: Rates): ContactFit {
 const key = league.join(',');
 let fits = LEAGUE_FITS.get(model);
 if (!fits) { fits = new Map(); LEAGUE_FITS.set(model, fits); }
 const cached = fits.get(key);
 if (cached) return cached;
 const fit = fitContact(model.basis, shapeTables(model.shape).regionShare, contactTargets(league), '', 0.5, 'league average');
 if (!(fit.error <= FIT_TOLERANCE)) throw new Error(`League contact fit misses its target by ${fit.error}`);
 fits.set(key, fit);
 return fit;
}

const NON_CONTACT = 4;

/** Per batter/pitcher pair: BB/HBP/SO/contact CDF, region CDF, power shift, and batting side. */
export interface PreparedMatchups {
 batterCount: number;
 pitcherCount: number;
 nonContactCdf: Float64Array;
 regionCdf: Float64Array;
 shift: Float64Array;
 side: Side[];
 tables: ShapeTables;
}

export function buildMatchupInputs(batters: readonly Profile[], pitchers: readonly Profile[], league: Rates, model: ContactModel): PreparedMatchups {
 const pairs = batters.length * pitchers.length;
 const prior = leagueContactFit(model, league).regionWeights;
 const prepared: PreparedMatchups = {
  batterCount: batters.length, pitcherCount: pitchers.length,
  nonContactCdf: new Float64Array(pairs * NON_CONTACT), regionCdf: new Float64Array(pairs * REGION_COUNT),
  shift: new Float64Array(pairs), side: new Array<Side>(pairs), tables: shapeTables(model.shape)
 };
 for (let hitter = 0; hitter < batters.length; hitter++) for (let pitcher = 0; pitcher < pitchers.length; pitcher++) {
  const batter = batters[hitter];
  const thrower = pitchers[pitcher];
  const rates = matchup(batter, thrower, league);
  const pair = hitter * pitchers.length + pitcher;
  const offset = pair * NON_CONTACT;
  prepared.nonContactCdf[offset] = rates[0];
  prepared.nonContactCdf[offset + 1] = rates[0] + rates[1];
  prepared.nonContactCdf[offset + 2] = rates[0] + rates[1] + rates[2];
  prepared.nonContactCdf[offset + 3] = 1;
  const side = battingSide(batter, thrower);
  const fit = fitContact(model.basis, prior, contactTargets(rates), side, batter.speed, `${batter.seasonId} vs ${thrower.seasonId}`);
  let cumulative = 0;
  for (let region = 0; region < REGION_COUNT; region++) {
   cumulative += fit.regionWeights[region];
   prepared.regionCdf[pair * REGION_COUNT + region] = cumulative;
  }
  prepared.regionCdf[pair * REGION_COUNT + REGION_COUNT - 1] = 1;
  prepared.shift[pair] = POWER_SHIFTS[fit.shiftIndex];
  prepared.side[pair] = side;
 }
 return prepared;
}

/** Returns 0 = BB, 1 = HBP, 2 = SO, 3 = contact. */
export function sampleNonContact(prepared: PreparedMatchups, pair: number, uniform: number): number {
 if (!(uniform >= 0 && uniform < 1)) throw new Error('Invalid random sample');
 const offset = pair * NON_CONTACT;
 for (let event = 0; event < NON_CONTACT; event++) if (uniform < prepared.nonContactCdf[offset + event]) return event;
 return NON_CONTACT - 1;
}

export function sampleContact(prepared: PreparedMatchups, pair: number, uniforms: Float64Array, output: ContactDraw): ContactDraw {
 for (let index = 0; index < CONTACT_UNIFORMS; index++) if (!(uniforms[index] >= 0 && uniforms[index] < 1)) throw new Error('Invalid random sample');
 return drawContact(prepared.tables, prepared.regionCdf, pair * REGION_COUNT, prepared.shift[pair], prepared.side[pair], uniforms, output);
}
