import { POSITIONS, type DefensiveEnvironment, type DefensiveSkills, type Position } from '../game/types.ts';
import { forcedBaseTransition } from './advancement.ts';
import { leagueContactFit, REGION_COUNT, SHAPE_BINS, launchClass, shapeTables, sideIndex, type ContactModel } from './contact-profile.ts';
import { forEachLatticeTrace } from './contact-basis.ts';
import {
 createContactOptions,
 createContactResult,
 createDecisions,
 createNeutralDefense,
 enumerateDecisions,
 resolveContact,
 type ContactOptions,
 type PreparedDefense
} from './contact.ts';
import { stealSuccessProbability } from './defense-rules.ts';
import {
 OUTCOME_FOUL,
 PHYSICAL_CLASS_COUNT,
 buildFieldingPlan,
 classKind,
 computeCandidates,
 createFieldingCandidates,
 fillActualCandidate,
 createFieldingPlan,
 createPhysicalOutcomes,
 fieldingOutcomes,
 physicalClass
} from './fielding.ts';

export const STATE_COUNT = 24;
/** Runs-needed targets 1, 2, 3, 4, and unlimited. */
export const TARGETS = [1, 2, 3, 4, Infinity] as const;
export const INFINITY_TARGET = 4;
const SKILL_NODES = [-1, -0.5, 0, 0.5, 1] as const;
const HALF_INNINGS_PER_SEASON = 1458;

/** Sparse transition rows: probability, runs, next state (-1 when the half inning or game ends). */
export interface TransitionRows { offsets: Int32Array; probability: Float64Array; runs: Int8Array; next: Int16Array }

interface Variant { classes: Float64Array; prepared: PreparedDefense; options: ContactOptions }

export interface PhysicalReference {
 readonly environment: DefensiveEnvironment;
 readonly model: ContactModel;
 /** League neutral contact, as physical outcome classes. */
 readonly classes: Float64Array;
 /** Transitions per target index. */
 readonly transitions: TransitionRows[];
 readonly runExpectancy: Float64Array;
 readonly stateVisits: Float64Array;
 /** Expected runs plus continuation per state and target, before subtracting the state value. */
 readonly paValues: Float64Array;
 readonly neutralCycleCosts: Float64Array;
 coefficients: DefenseCoefficients | null;
 readonly positionCaches: Map<string, number>[];
}

/** League class distribution at the league power shift, unknown side, and average speed. */
function leagueClasses(model: ContactModel, environment: DefensiveEnvironment): Float64Array {
 const fit = leagueContactFit(model, environment.leagueRates);
 const classes = new Float64Array(PHYSICAL_CLASS_COUNT);
 for (let region = 0; region < REGION_COUNT; region++) {
  const offset = (fit.shiftIndex * REGION_COUNT + region) * PHYSICAL_CLASS_COUNT;
  for (let cls = 0; cls < PHYSICAL_CLASS_COUNT; cls++) classes[cls] += fit.regionWeights[region] * model.basis.classes[offset + cls];
 }
 const total = classes.reduce((sum, value) => sum + value, 0);
 if (!(Math.abs(total - 1) < 1e-6)) throw new Error('League contact classes do not sum to one');
 for (let cls = 0; cls < PHYSICAL_CLASS_COUNT; cls++) classes[cls] /= total;
 return classes;
}

const result = createContactResult();
const decisions = createDecisions();
const participants = new Uint8Array(3);
const base = { runners: new Int16Array(3), pitchers: new Int16Array(3) };
const runners = Array.from({ length: 4 }, () => ({ speed: 0.5 }));

function setState(mask: number): void {
 for (let index = 0; index < 3; index++) {
  const occupied = (mask & (1 << index)) !== 0;
  base.runners[index] = occupied ? index + 1 : -1;
  base.pitchers[index] = occupied ? 0 : -1;
 }
}

const maskOf = (runnersOnBase: Int16Array): number => (runnersOnBase[0] >= 0 ? 1 : 0) | (runnersOnBase[1] >= 0 ? 2 : 0) | (runnersOnBase[2] >= 0 ? 4 : 0);

/** Visits each legal result of one plate appearance from `state` for the variant. */
function visitPlateAppearance(
 environment: DefensiveEnvironment,
 variant: Variant,
 state: number,
 target: number,
 visit: (probability: number, runs: number, outs: number, bases: number, ended: boolean) => void
): void {
 const outs = Math.floor(state / 8);
 const mask = state & 7;
 const rates = environment.leagueRates;
 const contact = rates[3] + rates[4] + rates[5] + rates[6] + rates[7];
 const walk = rates[0] + rates[1];
 if (walk > 0) {
  const transition = forcedBaseTransition(mask);
  const runs = transition >> 3;
  visit(walk, runs, outs, transition & 7, runs >= target);
 }
 if (rates[2] > 0) visit(rates[2], 0, outs + 1, mask, false);
 for (let cls = 0; cls < PHYSICAL_CLASS_COUNT; cls++) {
  const weight = contact * variant.classes[cls];
  if (weight === 0) continue;
  const { kind, fielder, bases } = classKind(cls);
  enumerateDecisions(decisions, () => {
   setState(mask);
   resolveContact(result, base, outs, kind, fielder, bases, 0, 0, runners, environment.leagueDoublePlay, variant.prepared, variant.options, decisions, 0, target, participants);
  }, probability => visit(weight * probability, result.runs, result.outsAfter, maskOf(result.runners), result.ended));
 }
}

function buildTransitions(environment: DefensiveEnvironment, variant: Variant, target: number): TransitionRows {
 const offsets = new Int32Array(STATE_COUNT + 1);
 const probability: number[] = [], runs: number[] = [], next: number[] = [];
 for (let state = 0; state < STATE_COUNT; state++) {
  const merged = new Map<number, number>();
  visitPlateAppearance(environment, variant, state, target, (p, scored, outs, bases, ended) => {
   const after = ended || outs >= 3 ? -1 : outs * 8 + bases;
   const key = scored * 32 + (after + 1);
   merged.set(key, (merged.get(key) ?? 0) + p);
  });
  offsets[state] = probability.length;
  for (const [key, p] of [...merged].sort(([a], [b]) => a - b)) {
   probability.push(p);
   runs.push(Math.floor(key / 32));
   next.push((key % 32) - 1);
  }
  const total = merged.size ? [...merged.values()].reduce((sum, value) => sum + value, 0) : 0;
  if (!(Math.abs(total - 1) < 1e-9)) throw new Error(`Physical transitions lost probability mass in state ${state}`);
 }
 offsets[STATE_COUNT] = probability.length;
 return { offsets, probability: Float64Array.from(probability), runs: Int8Array.from(runs), next: Int16Array.from(next) };
}

function solveLinear(matrix: Float64Array, rhs: Float64Array, size: number): Float64Array {
 const a = Float64Array.from(matrix);
 const b = Float64Array.from(rhs);
 for (let column = 0; column < size; column++) {
  let pivot = column;
  for (let row = column + 1; row < size; row++) if (Math.abs(a[row * size + column]) > Math.abs(a[pivot * size + column])) pivot = row;
  if (!(Math.abs(a[pivot * size + column]) > 1e-14)) throw new Error('Run expectancy system is singular');
  for (let k = 0; k < size; k++) { const swap = a[column * size + k]; a[column * size + k] = a[pivot * size + k]; a[pivot * size + k] = swap; }
  const swap = b[column]; b[column] = b[pivot]; b[pivot] = swap;
  for (let row = column + 1; row < size; row++) {
   const factor = a[row * size + column] / a[column * size + column];
   for (let k = column; k < size; k++) a[row * size + k] -= factor * a[column * size + k];
   b[row] -= factor * b[column];
  }
 }
 for (let row = size - 1; row >= 0; row--) {
  let value = b[row];
  for (let k = row + 1; k < size; k++) value -= a[row * size + k] * b[k];
  b[row] = value / a[row * size + row];
 }
 return b;
}

/** Expected runs to the end of the half inning, and expected visits from the empty, no-out state. */
function solveMarkov(rows: TransitionRows): { expectancy: Float64Array; visits: Float64Array } {
 const system = new Float64Array(STATE_COUNT * STATE_COUNT);
 const transposed = new Float64Array(STATE_COUNT * STATE_COUNT);
 const reward = new Float64Array(STATE_COUNT);
 for (let state = 0; state < STATE_COUNT; state++) {
  system[state * STATE_COUNT + state] += 1;
  transposed[state * STATE_COUNT + state] += 1;
  for (let index = rows.offsets[state]; index < rows.offsets[state + 1]; index++) {
   reward[state] += rows.probability[index] * rows.runs[index];
   const next = rows.next[index];
   if (next < 0) continue;
   system[state * STATE_COUNT + next] -= rows.probability[index];
   transposed[next * STATE_COUNT + state] -= rows.probability[index];
  }
 }
 const start = new Float64Array(STATE_COUNT);
 start[0] = 1;
 const expectancy = solveLinear(system, reward, STATE_COUNT);
 const visits = solveLinear(transposed, start, STATE_COUNT);
 if (expectancy.some(value => !Number.isFinite(value) || value < 0) || visits.some(value => !Number.isFinite(value) || value < -1e-12)) throw new Error('Run expectancy solve is invalid');
 return { expectancy, visits };
}

function neutralVariant(environment: DefensiveEnvironment, classes: Float64Array): Variant {
 return { classes, prepared: createNeutralDefense(environment), options: createContactOptions() };
}

function plateAppearanceValue(environment: DefensiveEnvironment, variant: Variant, expectancy: Float64Array, state: number, target: number): number {
 let value = 0;
 visitPlateAppearance(environment, variant, state, target, (p, runs, outs, bases, ended) => {
  value += p * (runs + (ended || outs >= 3 ? 0 : expectancy[outs * 8 + bases]));
 });
 return value;
}

/** Steal attempts precede the plate appearance with first occupied and second open. */
function cycleCost(reference: PhysicalReference, variant: Variant, state: number, catcherThrowing: number): number {
 const environment = reference.environment;
 const expectancy = reference.runExpectancy;
 const outs = Math.floor(state / 8);
 const bases = state & 7;
 const pa = (s: number) => plateAppearanceValue(environment, variant, expectancy, s, Infinity);
 if ((bases & 1) === 0 || (bases & 2) !== 0) return pa(state);
 const attempt = environment.leagueStealAttempt;
 const success = stealSuccessProbability(environment.leagueStealSuccess, catcherThrowing);
 const caughtOuts = outs + 1;
 const caught = caughtOuts >= 3 ? 0 : pa(caughtOuts * 8 + (bases & ~1));
 return (1 - attempt) * pa(state) + attempt * (success * pa(outs * 8 + ((bases & ~1) | 2)) + (1 - success) * caught);
}

export function createPhysicalReference(environment: DefensiveEnvironment): PhysicalReference {
 const model = environment.contactModel;
 const classes = leagueClasses(model, environment);
 const neutral = neutralVariant(environment, classes);
 const transitions = TARGETS.map(target => buildTransitions(environment, neutral, target));
 const { expectancy, visits } = solveMarkov(transitions[INFINITY_TARGET]);
 const paValues = new Float64Array(STATE_COUNT * TARGETS.length);
 for (let state = 0; state < STATE_COUNT; state++) for (let target = 0; target < TARGETS.length; target++) {
  const rows = transitions[target];
  let value = 0;
  for (let index = rows.offsets[state]; index < rows.offsets[state + 1]; index++) {
   const next = rows.next[index];
   value += rows.probability[index] * (rows.runs[index] + (next < 0 ? 0 : expectancy[next]));
  }
  paValues[state * TARGETS.length + target] = value;
 }
 const reference: PhysicalReference = {
  environment, model, classes, transitions, runExpectancy: expectancy, stateVisits: visits, paValues,
  neutralCycleCosts: new Float64Array(STATE_COUNT), coefficients: null,
  positionCaches: Array.from({ length: POSITIONS.length }, () => new Map<string, number>())
 };
 for (let state = 0; state < STATE_COUNT; state++) reference.neutralCycleCosts[state] = cycleCost(reference, neutral, state, 0);
 return reference;
}

const REFERENCES = new WeakMap<DefensiveEnvironment, PhysicalReference>();
export function getPhysicalReference(environment: DefensiveEnvironment): PhysicalReference {
 const cached = REFERENCES.get(environment);
 if (cached) return cached;
 const created = createPhysicalReference(environment);
 REFERENCES.set(environment, created);
 return created;
}

export function targetIndex(runsNeeded: number): number {
 if (!Number.isFinite(runsNeeded) || runsNeeded > 4) return INFINITY_TARGET;
 return Math.max(0, Math.ceil(runsNeeded) - 1);
}

/** Expected runs plus continuation for one neutral plate appearance, honoring walkoff stopping. */
export function expectedNeutralPlateAppearanceValue(reference: PhysicalReference, state: number, runsNeeded = Infinity): number {
 if (!Number.isInteger(state) || state < 0 || state >= STATE_COUNT || (!Number.isFinite(runsNeeded) && runsNeeded !== Infinity) || runsNeeded <= 0) {
  throw new Error('Invalid neutral plate appearance state');
 }
 return reference.paValues[state * TARGETS.length + targetIndex(runsNeeded)];
}

/**
 * Run-valued skill coefficients: each skill component's season runs saved at five skill nodes
 * for each position, with the other components neutral. Range comes from one neutral lattice pass
 * that recomputes only the target defender's reach.
 */
export interface DefenseCoefficients {
 /** [position][component][node], components in DefensiveSkills key order. */
 values: Float64Array;
}
const COMPONENTS: readonly (keyof DefensiveSkills)[] = ['hitPrevention', 'doublePlay', 'outfieldThrowing', 'errorAvoidance', 'catcherThrowing'];

function applies(position: number, component: keyof DefensiveSkills): boolean {
 if (component === 'hitPrevention' || component === 'errorAvoidance') return true;
 if (component === 'doublePlay') return position >= 1 && position <= 4;
 if (component === 'outfieldThrowing') return position >= 5;
 return position === 0;
}

/** League-weighted lattice classes when one position's reach or arm takes each skill node. */
/** The lattice pass depends only on the contact model and league rates, so it is shared across environments. */
const LATTICE_VARIANTS = new WeakMap<ContactModel, Map<string, { reach: Float64Array; arm: Float64Array }>>();
function latticeVariantClasses(reference: PhysicalReference): { reach: Float64Array; arm: Float64Array } {
 const key = reference.environment.leagueRates.join(',');
 let byRates = LATTICE_VARIANTS.get(reference.model);
 if (!byRates) { byRates = new Map(); LATTICE_VARIANTS.set(reference.model, byRates); }
 const cached = byRates.get(key);
 if (cached) return cached;
 const computed = computeLatticeVariantClasses(reference);
 byRates.set(key, computed);
 return computed;
}

function computeLatticeVariantClasses(reference: PhysicalReference): { reach: Float64Array; arm: Float64Array } {
 const model = reference.model;
 const tables = shapeTables(model.shape);
 const fit = leagueContactFit(model, reference.environment.leagueRates);
 const shift = fit.shiftIndex;
 const launchCount = SHAPE_BINS.launch.count, sprayCount = SHAPE_BINS.spray.count;
 const cellWeights = new Float64Array(SHAPE_BINS.ev.count * launchCount);
 for (let region = 0; region < REGION_COUNT; region++) {
  const cdf = tables.cellCdf[region];
  tables.cells[region].forEach((cell, position) => { cellWeights[cell] = fit.regionWeights[region] * (cdf[position] - (position === 0 ? 0 : cdf[position - 1])); });
 }
 const nodes = SKILL_NODES.length;
 const reach = new Float64Array(POSITIONS.length * nodes * PHYSICAL_CLASS_COUNT);
 const arm = new Float64Array(POSITIONS.length * nodes * PHYSICAL_CLASS_COUNT);
 const candidates = createFieldingCandidates();
 const plan = createFieldingPlan();
 const outcomes = createPhysicalOutcomes();
 const zeros = new Float64Array(8);
 const mask = new Uint8Array(8);
 const throwing = new Float64Array(8);
 const accumulate = (output: Float64Array, offset: number, weight: number) => {
  fieldingOutcomes(plan, 0.5, outcomes);
  let fair = 0;
  for (let index = 0; index < outcomes.count; index++) if (outcomes.kind[index] !== OUTCOME_FOUL) fair += outcomes.probability[index];
  for (let index = 0; index < outcomes.count; index++) {
   if (outcomes.kind[index] === OUTCOME_FOUL) continue;
   output[offset + physicalClass(outcomes.kind[index], outcomes.fielder[index], outcomes.bases[index])] += weight * outcomes.probability[index] / fair;
  }
 };
 forEachLatticeTrace((e, l, s, trace, carryWeight) => {
  const cellEv = e - shift;
  if (cellEv < 0 || cellEv >= SHAPE_BINS.ev.count) return;
  const cellWeight = cellWeights[cellEv * launchCount + l];
  if (cellWeight === 0) return;
  const sprayCdf = tables.sprayCdf[sideIndex('') * 4 + launchClass(SHAPE_BINS.launch.min + (l + 0.5) * SHAPE_BINS.launch.width)];
  const weight = carryWeight * cellWeight * (sprayCdf[s] - (s === 0 ? 0 : sprayCdf[s - 1]));
  if (weight === 0) return;
  computeCandidates(trace, zeros, candidates);
  for (let position = 0; position < POSITIONS.length; position++) {
   for (let node = 0; node < nodes; node++) {
    fillActualCandidate(trace, position, SKILL_NODES[node], candidates);
    mask.fill(0);
    mask[position] = 1;
    throwing.fill(0);
    buildFieldingPlan(trace, candidates, mask, throwing, plan);
    accumulate(reach, (position * nodes + node) * PHYSICAL_CLASS_COUNT, weight);
    if (position >= 5) {
     mask.fill(0);
     throwing[position] = SKILL_NODES[node];
     buildFieldingPlan(trace, candidates, mask, throwing, plan);
     accumulate(arm, (position * nodes + node) * PHYSICAL_CLASS_COUNT, weight);
    }
   }
  }
 });
 return { reach, arm };
}

function computeCoefficients(reference: PhysicalReference): DefenseCoefficients {
 const environment = reference.environment;
 const { reach, arm } = latticeVariantClasses(reference);
 const nodes = SKILL_NODES.length;
 const values = new Float64Array(POSITIONS.length * COMPONENTS.length * nodes);
 for (let position = 0; position < POSITIONS.length; position++) {
  for (let component = 0; component < COMPONENTS.length; component++) {
   const name = COMPONENTS[component];
   if (!applies(position, name)) continue;
   for (let node = 0; node < nodes; node++) {
    const skill = SKILL_NODES[node];
    if (skill === 0) continue;
    const variant = neutralVariant(environment, reference.classes);
    let catcher = 0;
    if (name === 'hitPrevention') variant.classes = reach.slice((position * nodes + node) * PHYSICAL_CLASS_COUNT, (position * nodes + node + 1) * PHYSICAL_CLASS_COUNT);
    else if (name === 'outfieldThrowing') {
     variant.classes = arm.slice((position * nodes + node) * PHYSICAL_CLASS_COUNT, (position * nodes + node + 1) * PHYSICAL_CLASS_COUNT);
     variant.prepared.outfieldThrowing[position] = skill;
     variant.options.outfieldThrowing = true;
    } else if (name === 'errorAvoidance') {
     variant.prepared.errorAvoidance[position] = skill;
     variant.options.errorPositions[position] = 1;
    } else if (name === 'doublePlay') {
     variant.prepared.doublePlay[position] = skill;
     variant.options.doublePlayPositions[position] = 1;
    } else catcher = skill;
    let saved = 0;
    for (let state = 0; state < STATE_COUNT; state++) {
     const visits = reference.stateVisits[state];
     if (visits === 0) continue;
     saved += HALF_INNINGS_PER_SEASON * visits * (reference.neutralCycleCosts[state] - cycleCost(reference, variant, state, catcher));
    }
    if (!Number.isFinite(saved)) throw new Error('Defensive reference produced a non-finite value');
    values[(position * COMPONENTS.length + component) * nodes + node] = saved;
   }
  }
 }
 return { values };
}

function interpolate(values: Float64Array, offset: number, skill: number): number {
 let result = 0;
 for (let node = 0; node < SKILL_NODES.length; node++) {
  let weight = 1;
  for (let other = 0; other < SKILL_NODES.length; other++) if (other !== node) weight *= (skill - SKILL_NODES[other]) / (SKILL_NODES[node] - SKILL_NODES[other]);
  result += weight * values[offset + node];
 }
 return result;
}

function invalidDefensiveSkills(skills: DefensiveSkills): boolean {
 return COMPONENTS.some(name => !Number.isFinite(skills[name]) || skills[name] < -1 || skills[name] > 1);
}

/**
 * Season runs saved relative to a neutral defender: the sum of per-component coefficient curves
 * (interactions between components are not modeled in this estimate).
 */
export function expectedDefensiveRuns(reference: PhysicalReference, position: Position, skills: DefensiveSkills): number {
 const target = POSITIONS.indexOf(position);
 if (target < 0 || invalidDefensiveSkills(skills)) throw new Error('Invalid defensive skill input');
 const key = COMPONENTS.map(name => skills[name]).join('|');
 const cached = reference.positionCaches[target].get(key);
 if (cached !== undefined) return cached;
 reference.coefficients ??= computeCoefficients(reference);
 let saved = 0;
 COMPONENTS.forEach((name, component) => {
  if (!applies(target, name) || skills[name] === 0) return;
  saved += interpolate(reference.coefficients!.values, (target * COMPONENTS.length + component) * SKILL_NODES.length, skills[name]);
 });
 if (!Number.isFinite(saved)) throw new Error('Defensive reference produced a non-finite value');
 reference.positionCaches[target].set(key, saved);
 return saved;
}
