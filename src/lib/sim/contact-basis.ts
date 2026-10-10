import {
 CONTACT_OUTCOMES,
 POWER_SHIFTS,
 REGION_COUNT,
 SHAPE_BINS,
 SIDES,
 SPEED_NODES,
 launchClass,
 regionOf,
 shapeTables,
 sideIndex,
 type ContactBasis,
 type ContactShape
} from './contact-profile.ts';
import {
 OUTCOME_FOUL,
 PHYSICAL_CLASS_COUNT,
 buildFieldingPlan,
 computeCandidates,
 createFieldingCandidates,
 createFieldingPlan,
 createPhysicalOutcomes,
 fieldingOutcomes,
 physicalClass
} from './fielding.ts';
import { CARRY_NODES, carryAt, createFlightTrace, preparePark, traceFlight, type ContactSample, type FlightTrace } from './flight.ts';
import { neutralPark } from './park.ts';

/** Lattice exit-velocity positions cover every histogram bin under every power shift. */
const SHIFT_STEPS = POWER_SHIFTS.length;
const SHIFT_ORIGIN = POWER_SHIFTS.indexOf(0);
export const LATTICE_EV_COUNT = SHAPE_BINS.ev.count + SHIFT_STEPS - 1;
export const LATTICE_POINTS = LATTICE_EV_COUNT * SHAPE_BINS.launch.count * SHAPE_BINS.spray.count;

/** Midpoint of histogram cell (ev + shift step, launch, spray). */
export function latticeSample(evIndex: number, launchIndex: number, sprayIndex: number, output: ContactSample): ContactSample {
 output.speedMph = SHAPE_BINS.ev.min + (evIndex - SHIFT_ORIGIN + 0.5) * SHAPE_BINS.ev.width;
 output.launchDeg = SHAPE_BINS.launch.min + (launchIndex + 0.5) * SHAPE_BINS.launch.width;
 output.sprayDeg = SHAPE_BINS.spray.min + (sprayIndex + 0.5) * SHAPE_BINS.spray.width;
 return output;
}

/** Traces every lattice midpoint in the neutral park at each carry quadrature node; `weight` is the node weight. */
export function forEachLatticeTrace(visit: (evIndex: number, launchIndex: number, sprayIndex: number, trace: FlightTrace, weight: number) => void): void {
 const park = preparePark(neutralPark());
 const trace = createFlightTrace();
 const sample: ContactSample = { speedMph: 0, launchDeg: 0, sprayDeg: 0, carry: 1 };
 for (let e = 0; e < LATTICE_EV_COUNT; e++) for (let l = 0; l < SHAPE_BINS.launch.count; l++) for (let s = 0; s < SHAPE_BINS.spray.count; s++) {
  latticeSample(e, l, s, sample);
  for (const [z, weight] of CARRY_NODES) {
   sample.carry = carryAt(z);
   traceFlight(sample, park, trace);
   visit(e, l, s, trace, weight);
  }
 }
}

const latticeIndex = (e: number, l: number, s: number): number => (e * SHAPE_BINS.launch.count + l) * SHAPE_BINS.spray.count + s;

/**
 * Integrates neutral-park outcomes over the league shape: for each region, histogram cell
 * probabilities times side-specific spray probabilities times the lattice midpoint response.
 */
export function buildContactBasis(shape: ContactShape): ContactBasis {
 const tables = shapeTables(shape);
 const speedCount = SPEED_NODES.length;
 const nodeResponses = new Float64Array(LATTICE_POINTS * speedCount * CONTACT_OUTCOMES);
 const nodeClasses = new Float64Array(LATTICE_POINTS * PHYSICAL_CLASS_COUNT);
 const candidates = createFieldingCandidates();
 const plan = createFieldingPlan();
 const outcomes = createPhysicalOutcomes();
 const zeros = new Float64Array(8);
 const mask = new Uint8Array(8);
 const averageSpeed = SPEED_NODES.indexOf(0.5);
 forEachLatticeTrace((e, l, s, trace, carryWeight) => {
  const point = latticeIndex(e, l, s);
  computeCandidates(trace, zeros, candidates);
  buildFieldingPlan(trace, candidates, mask, zeros, plan);
  for (let speed = 0; speed < speedCount; speed++) {
   fieldingOutcomes(plan, SPEED_NODES[speed], outcomes);
   let fair = 0;
   for (let index = 0; index < outcomes.count; index++) if (outcomes.kind[index] !== OUTCOME_FOUL) fair += outcomes.probability[index];
   if (!(fair > 0)) throw new Error(`Neutral lattice point is never fair: ${e}:${l}:${s}`);
   for (let index = 0; index < outcomes.count; index++) {
    const kind = outcomes.kind[index];
    if (kind === OUTCOME_FOUL) continue;
    const probability = carryWeight * outcomes.probability[index] / fair;
    const cls = physicalClass(kind, outcomes.fielder[index], outcomes.bases[index]);
    const column = cls === 42 ? 3 : cls === 43 ? 1 : cls >= 18 ? outcomes.bases[index] - 1 : cls >= 13 ? 0 : 4;
    nodeResponses[(point * speedCount + speed) * CONTACT_OUTCOMES + column] += probability;
    if (speed === averageSpeed) nodeClasses[point * PHYSICAL_CLASS_COUNT + cls] += probability;
   }
  }
 });
 const responses = new Array<number>(SIDES.length * speedCount * SHIFT_STEPS * REGION_COUNT * CONTACT_OUTCOMES).fill(0);
 const classes = new Array<number>(SHIFT_STEPS * REGION_COUNT * PHYSICAL_CLASS_COUNT).fill(0);
 const sprayCount = SHAPE_BINS.spray.count;
 const unknown = sideIndex('');
 for (let region = 0; region < REGION_COUNT; region++) {
  const cdf = tables.cellCdf[region];
  tables.cells[region].forEach((cell, position) => {
   const cellProbability = cdf[position] - (position === 0 ? 0 : cdf[position - 1]);
   const e = Math.floor(cell / SHAPE_BINS.launch.count);
   const l = cell - e * SHAPE_BINS.launch.count;
   if (regionOf(e, l) !== region) throw new Error('Contact basis region mismatch');
   const launchClassIndex = launchClass(SHAPE_BINS.launch.min + (l + 0.5) * SHAPE_BINS.launch.width);
   for (let side = 0; side < SIDES.length; side++) {
    const sprayCdf = tables.sprayCdf[side * 4 + launchClassIndex];
    for (let s = 0; s < sprayCount; s++) {
     const weight = cellProbability * (sprayCdf[s] - (s === 0 ? 0 : sprayCdf[s - 1]));
     if (weight === 0) continue;
     for (let shift = 0; shift < SHIFT_STEPS; shift++) {
      const point = latticeIndex(e + shift, l, s);
      for (let speed = 0; speed < speedCount; speed++) {
       const target = (((side * speedCount + speed) * SHIFT_STEPS + shift) * REGION_COUNT + region) * CONTACT_OUTCOMES;
       const source = (point * speedCount + speed) * CONTACT_OUTCOMES;
       for (let outcome = 0; outcome < CONTACT_OUTCOMES; outcome++) responses[target + outcome] += weight * nodeResponses[source + outcome];
      }
      if (side === unknown) {
       const target = (shift * REGION_COUNT + region) * PHYSICAL_CLASS_COUNT;
       for (let cls = 0; cls < PHYSICAL_CLASS_COUNT; cls++) classes[target + cls] += weight * nodeClasses[point * PHYSICAL_CLASS_COUNT + cls];
      }
     }
    }
   }
  });
 }
 return { responses, classes };
}
