import { INFIELD_CENTER, INFIELD_RADIUS_M, pointInPolygon } from './park.ts';
import type { StadiumConfig } from './park-types.ts';

export const FLIGHT_DT = 1 / 60;
export const LAUNCH_HEIGHT_M = 1;
export const GRAVITY_MPS2 = 9.80665;
/**
 * Declared spin-free drag and lift approximation fitted to 2025 Statcast hit distances
 * (median distance per 5 mph x 4 degree bin, 70+ mph, 8-60 degrees, Coors excluded;
 * 3.6 ft count-weighted RMS): drag = -0.0053 * density * (|v - wind| / 44.704)^-0.4 *
 * |v - wind| * (v - wind), so the drag coefficient falls with speed; lift = 0.0037 * density *
 * shape(launch) * |v - wind| times the relative velocity rotated 90 degrees upward in its
 * vertical plane. shape = clamp((launch - 12) / 15, -1, 1), tapering to zero from 60 to 100
 * degrees; negative values stand in for topspin.
 */
export const DRAG_COEFFICIENT = 0.0053;
export const DRAG_SPEED_EXPONENT = -0.4;
export const DRAG_REFERENCE_MPS = 44.704;
export const LIFT_COEFFICIENT = 0.0037;
export const liftShape = (launchDeg: number): number =>
 Math.max(-1, Math.min(1, (launchDeg - 12) / 15)) * Math.max(0, 1 - Math.max(0, launchDeg - 60) / 40);
export const MAX_FLIGHT_SECONDS = 20;
export const MAX_REBOUNDS = 16;
export const MPH_TO_MPS = 0.44704;
const TRACE_CAPACITY = Math.ceil(MAX_FLIGHT_SECONDS / FLIGHT_DT) + 2 * MAX_REBOUNDS + 8;
const WALL_OFFSET_M = 1e-6;
const MIN_STEP_FRACTION = 1e-12;

/**
 * Ball-to-ball carry: `carry` divides drag. Draws use CARRY_BIAS * exp(CARRY_SIGMA * z), z standard
 * normal; sigma reproduces the ~15 ft distance spread at fixed exit velocity and launch, and the
 * bias offsets the short caught-ball distances in the median fit, matching 2025 actual-park HR
 * (model 4.7% of batted balls vs 4.76%).
 */
export const CARRY_SIGMA = 0.075;
export const CARRY_BIAS = 1.025;
/** Three-point Gauss-Hermite nodes (standard normal z, weight) for integrating carry. */
export const CARRY_NODES: readonly (readonly [number, number])[] = [[-Math.sqrt(3), 1 / 6], [0, 2 / 3], [Math.sqrt(3), 1 / 6]];
export const carryAt = (z: number): number => CARRY_BIAS * Math.exp(CARRY_SIGMA * z);
export interface ContactSample { speedMph: number; launchDeg: number; sprayDeg: number; carry?: number }

export const TRACE_STOPPED = 0;
export const TRACE_HOME_RUN = 1;
export const TRACE_AUTOMATIC_DOUBLE = 2;
export const TRACE_DEAD_BALL = 3;
export const EVENT_NONE = 0;
export const EVENT_FENCE = 1;
export const EVENT_OVERHEAD = 2;
export const EVENT_GROUND = 3;

/** A reusable trajectory buffer: airborne samples, then rolling samples with z = 0. */
export interface FlightTrace {
 count: number;
 t: Float64Array; x: Float64Array; y: Float64Array; z: Float64Array;
 /** First rolling sample, or -1 when the ball never reached the ground in play. */
 landing: number;
 end: number;
 fair: boolean;
 rebounds: number;
 /** First collision, for causal diagnostics. */
 firstEvent: number; firstEventIndex: number; firstEventHeight: number; firstEventTime: number;
 /** Fence or overhead object that produced a terminal ruling. */
 endIndex: number;
}

export function createFlightTrace(): FlightTrace {
 return {
  count: 0,
  t: new Float64Array(TRACE_CAPACITY), x: new Float64Array(TRACE_CAPACITY), y: new Float64Array(TRACE_CAPACITY), z: new Float64Array(TRACE_CAPACITY),
  landing: -1, end: TRACE_STOPPED, fair: true, rebounds: 0,
  firstEvent: EVENT_NONE, firstEventIndex: -1, firstEventHeight: 0, firstEventTime: 0, endIndex: -1
 };
}

/** Flat geometry for allocation-free intersection tests. */
export interface PreparedPark {
 stadium: StadiumConfig;
 /** Per fence: ax, ay, bx, by, height, fair, unit normal x, unit normal y. */
 fences: Float64Array;
 fenceCount: number;
}
const FENCE_STRIDE = 8;
const PREPARED = new WeakMap<StadiumConfig, PreparedPark>();

export function preparePark(stadium: StadiumConfig): PreparedPark {
 const cached = PREPARED.get(stadium);
 if (cached) return cached;
 const fences = new Float64Array(stadium.fences.length * FENCE_STRIDE);
 stadium.fences.forEach((fence, index) => {
  const offset = index * FENCE_STRIDE;
  const dx = fence.end[0] - fence.start[0];
  const dy = fence.end[1] - fence.start[1];
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) throw new Error(`Degenerate fence segment ${index}: ${stadium.id}`);
  fences.set([fence.start[0], fence.start[1], fence.end[0], fence.end[1], fence.heightM, fence.fair ? 1 : 0, -dy / length, dx / length], offset);
 });
 const prepared = { stadium, fences, fenceCount: stadium.fences.length };
 PREPARED.set(stadium, prepared);
 return prepared;
}

function push(trace: FlightTrace, t: number, x: number, y: number, z: number): void {
 if (trace.count >= trace.t.length) throw new Error('Flight trace capacity exceeded');
 const index = trace.count++;
 trace.t[index] = t; trace.x[index] = x; trace.y[index] = y; trace.z[index] = z;
}

/** Parameter along p->q where it crosses fence `index`, or Infinity. */
function fenceCrossing(fences: Float64Array, index: number, px: number, py: number, qx: number, qy: number): number {
 const offset = index * FENCE_STRIDE;
 const ax = fences[offset], ay = fences[offset + 1];
 const ex = fences[offset + 2] - ax, ey = fences[offset + 3] - ay;
 const dx = qx - px, dy = qy - py;
 const denominator = dx * ey - dy * ex;
 if (denominator === 0) return Infinity;
 const wx = ax - px, wy = ay - py;
 const s = (wx * ey - wy * ex) / denominator;
 const u = (wx * dy - wy * dx) / denominator;
 return s > MIN_STEP_FRACTION && s <= 1 && u >= 0 && u <= 1 ? s : Infinity;
}

/** Reflects the horizontal velocity about the wall normal and backs the point inside the wall. */
function reflect(fences: Float64Array, index: number, restitution: number, position: Float64Array, velocity: Float64Array): void {
 const offset = index * FENCE_STRIDE;
 let nx = fences[offset + 6], ny = fences[offset + 7];
 const normal = velocity[0] * nx + velocity[1] * ny;
 if (normal < 0) { nx = -nx; ny = -ny; }
 const outward = Math.abs(normal);
 velocity[0] -= (1 + restitution) * outward * nx;
 velocity[1] -= (1 + restitution) * outward * ny;
 position[0] -= WALL_OFFSET_M * nx;
 position[1] -= WALL_OFFSET_M * ny;
}

function recordFirst(trace: FlightTrace, kind: number, index: number, height: number, time: number): void {
 if (trace.firstEvent !== EVENT_NONE) return;
 trace.firstEvent = kind; trace.firstEventIndex = index; trace.firstEventHeight = height; trace.firstEventTime = time;
}

const position = new Float64Array(3);
const velocity = new Float64Array(3);
const midpoint = new Float64Array(3);
const acceleration = new Float64Array(3);

let lift = 0;
let dragScale = 1;

function accelerate(stadium: StadiumConfig, v: Float64Array, output: Float64Array): void {
 const [wx, wy, wz] = stadium.windMps;
 const rx = v[0] - wx, ry = v[1] - wy, rz = v[2] - wz;
 const speed = Math.hypot(rx, ry, rz);
 const drag = -DRAG_COEFFICIENT * dragScale * stadium.airDensityKgM3 * (speed / DRAG_REFERENCE_MPS) ** DRAG_SPEED_EXPONENT * speed;
 output[0] = drag * rx;
 output[1] = drag * ry;
 output[2] = drag * rz - GRAVITY_MPS2;
 const horizontal = Math.hypot(rx, ry);
 if (lift === 0 || horizontal === 0) return;
 const scale = lift * stadium.airDensityKgM3 * speed;
 output[0] -= scale * rz * rx / horizontal;
 output[1] -= scale * rz * ry / horizontal;
 output[2] += scale * horizontal;
}

function airborneStep(park: PreparedPark, trace: FlightTrace, time: number): number {
 const stadium = park.stadium;
 accelerate(stadium, velocity, acceleration);
 for (let axis = 0; axis < 3; axis++) midpoint[axis] = velocity[axis] + acceleration[axis] * FLIGHT_DT / 2;
 const px = position[0], py = position[1], pz = position[2];
 const qx = px + midpoint[0] * FLIGHT_DT, qy = py + midpoint[1] * FLIGHT_DT, qz = pz + midpoint[2] * FLIGHT_DT;
 accelerate(stadium, midpoint, acceleration);
 const vx = velocity[0] + acceleration[0] * FLIGHT_DT;
 const vy = velocity[1] + acceleration[1] * FLIGHT_DT;
 const vz = velocity[2] + acceleration[2] * FLIGHT_DT;
 let best = Infinity, kind = EVENT_NONE, index = -1;
 for (let fence = 0; fence < park.fenceCount; fence++) {
  const s = fenceCrossing(park.fences, fence, px, py, qx, qy);
  if (s < best) { best = s; kind = EVENT_FENCE; index = fence; }
 }
 stadium.overhead.forEach((object, objectIndex) => {
  const h = object.heightM;
  if ((pz - h) * (qz - h) > 0 || pz === qz) return;
  const s = (h - pz) / (qz - pz);
  if (!(s > MIN_STEP_FRACTION && s <= 1)) return;
  if (s < best && pointInPolygon(px + (qx - px) * s, py + (qy - py) * s, object.polygon)) { best = s; kind = EVENT_OVERHEAD; index = objectIndex; }
 });
 if (qz <= 0 && pz > 0) {
  const s = pz / (pz - qz);
  if (s < best) { best = s; kind = EVENT_GROUND; index = -1; }
 }
 if (kind === EVENT_NONE) {
  position[0] = qx; position[1] = qy; position[2] = qz;
  velocity[0] = vx; velocity[1] = vy; velocity[2] = vz;
  push(trace, time + FLIGHT_DT, qx, qy, qz);
  return time + FLIGHT_DT;
 }
 const eventTime = time + best * FLIGHT_DT;
 position[0] = px + (qx - px) * best;
 position[1] = py + (qy - py) * best;
 position[2] = kind === EVENT_GROUND ? 0 : pz + (qz - pz) * best;
 velocity[0] += (vx - velocity[0]) * best;
 velocity[1] += (vy - velocity[1]) * best;
 velocity[2] += (vz - velocity[2]) * best;
 if (kind === EVENT_FENCE) {
  const height = park.fences[index * FENCE_STRIDE + 4];
  const fair = park.fences[index * FENCE_STRIDE + 5] === 1;
  recordFirst(trace, kind, index, position[2], eventTime);
  if (trace.landing < 0 && trace.rebounds === 0) trace.fair = fair;
  push(trace, eventTime, position[0], position[1], position[2]);
  if (position[2] > height) {
   trace.end = fair ? TRACE_HOME_RUN : TRACE_DEAD_BALL;
   trace.endIndex = index;
   return -1;
  }
  if (++trace.rebounds > MAX_REBOUNDS) throw new Error(`Flight exceeded ${MAX_REBOUNDS} rebounds`);
  reflect(park.fences, index, stadium.wallRestitution, position, velocity);
  return eventTime;
 }
 if (kind === EVENT_OVERHEAD) {
  const object = stadium.overhead[index];
  recordFirst(trace, kind, index, position[2], eventTime);
  push(trace, eventTime, position[0], position[1], position[2]);
  if (object.ruling === 'live-rebound') {
   if (++trace.rebounds > MAX_REBOUNDS) throw new Error(`Flight exceeded ${MAX_REBOUNDS} rebounds`);
   velocity[2] = -stadium.wallRestitution * velocity[2];
   position[2] += velocity[2] > 0 ? WALL_OFFSET_M : -WALL_OFFSET_M;
   return eventTime;
  }
  if (trace.landing < 0 && trace.rebounds === 0) trace.fair = Math.abs(position[0]) <= position[1];
  trace.end = object.ruling === 'home-run' ? (trace.fair ? TRACE_HOME_RUN : TRACE_DEAD_BALL) : object.ruling === 'automatic-double' ? (trace.fair ? TRACE_AUTOMATIC_DOUBLE : TRACE_DEAD_BALL) : TRACE_DEAD_BALL;
  trace.endIndex = index;
  return -1;
 }
 recordFirst(trace, kind, index, 0, eventTime);
 if (trace.rebounds === 0) trace.fair = Math.abs(position[0]) <= position[1];
 velocity[2] = 0;
 trace.landing = trace.count;
 push(trace, eventTime, position[0], position[1], 0);
 return eventTime;
}

function rollingStep(park: PreparedPark, trace: FlightTrace, time: number): number {
 const stadium = park.stadium;
 const speed = Math.hypot(velocity[0], velocity[1]);
 if (speed <= 0) return -1;
 const infield = Math.hypot(position[0] - INFIELD_CENTER[0], position[1] - INFIELD_CENTER[1]) <= INFIELD_RADIUS_M;
 const deceleration = infield ? stadium.infieldDecelerationMps2 : stadium.outfieldDecelerationMps2;
 const step = Math.min(FLIGHT_DT, speed / deceleration);
 const nextSpeed = Math.max(0, speed - deceleration * step);
 const distance = (speed + nextSpeed) / 2 * step;
 const ux = velocity[0] / speed, uy = velocity[1] / speed;
 const px = position[0], py = position[1];
 const qx = px + ux * distance, qy = py + uy * distance;
 let best = Infinity, index = -1;
 for (let fence = 0; fence < park.fenceCount; fence++) {
  const s = fenceCrossing(park.fences, fence, px, py, qx, qy);
  if (s < best) { best = s; index = fence; }
 }
 if (index < 0) {
  position[0] = qx; position[1] = qy;
  velocity[0] = ux * nextSpeed; velocity[1] = uy * nextSpeed;
  push(trace, time + step, qx, qy, 0);
  return nextSpeed === 0 ? -1 : time + step;
 }
 // Within one short step, time is treated as proportional to distance travelled.
 const eventTime = time + step * best;
 const eventSpeed = speed - deceleration * step * best;
 position[0] = px + (qx - px) * best;
 position[1] = py + (qy - py) * best;
 velocity[0] = ux * eventSpeed; velocity[1] = uy * eventSpeed;
 recordFirst(trace, EVENT_FENCE, index, 0, eventTime);
 push(trace, eventTime, position[0], position[1], 0);
 if (++trace.rebounds > MAX_REBOUNDS) throw new Error(`Flight exceeded ${MAX_REBOUNDS} rebounds`);
 reflect(park.fences, index, stadium.wallRestitution, position, velocity);
 return eventTime;
}

/** Deterministically resolves one contact sample against the active park geometry into `trace`. */
export function traceFlight(sample: ContactSample, park: PreparedPark, trace: FlightTrace): void {
 const { speedMph, launchDeg, sprayDeg } = sample;
 if (!Number.isFinite(speedMph) || speedMph <= 0 || !Number.isFinite(launchDeg) || launchDeg <= -90 || launchDeg >= 90 || !Number.isFinite(sprayDeg) || Math.abs(sprayDeg) >= 90) {
  throw new Error('Invalid contact sample');
 }
 trace.count = 0; trace.landing = -1; trace.end = TRACE_STOPPED; trace.fair = true; trace.rebounds = 0;
 trace.firstEvent = EVENT_NONE; trace.firstEventIndex = -1; trace.firstEventHeight = 0; trace.firstEventTime = 0; trace.endIndex = -1;
 const speed = speedMph * MPH_TO_MPS;
 const launch = launchDeg * Math.PI / 180;
 const spray = sprayDeg * Math.PI / 180;
 position[0] = 0; position[1] = 0; position[2] = LAUNCH_HEIGHT_M;
 velocity[0] = speed * Math.cos(launch) * Math.sin(spray);
 velocity[1] = speed * Math.cos(launch) * Math.cos(spray);
 velocity[2] = speed * Math.sin(launch);
 const carry = sample.carry ?? 1;
 if (!Number.isFinite(carry) || carry < 0) throw new Error('Invalid contact carry');
 lift = LIFT_COEFFICIENT * liftShape(launchDeg);
 dragScale = 1 / carry;
 push(trace, 0, 0, 0, LAUNCH_HEIGHT_M);
 let time = 0;
 while (time >= 0) {
  if (time > MAX_FLIGHT_SECONDS) throw new Error(`Flight exceeded ${MAX_FLIGHT_SECONDS} seconds`);
  time = trace.landing < 0 ? airborneStep(park, trace, time) : rollingStep(park, trace, time);
 }
}
