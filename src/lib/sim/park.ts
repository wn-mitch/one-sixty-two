import {
 ENVIRONMENT_VERSION,
 FEET_TO_METERS,
 GEOMETRY_VERSION,
 OVERHEAD_RULINGS,
 STADIUM_REFERENCE_YEAR,
 type FenceSegment,
 type OverheadObject,
 type ParkRef,
 type Provenance,
 type StadiumConfig,
 type StadiumDimension,
 type StadiumSummary,
 type Vec2
} from './park-types.ts';

/** Reference conditions shared by every Classic venue; they are model conditions, not 2025 weather. */
export const REFERENCE_CONDITIONS = {
 windMps: [0, 0, 0] as [number, number, number],
 infieldDecelerationMps2: 2.0,
 outfieldDecelerationMps2: 2.5,
 wallRestitution: 0.55,
 ordinaryWallHeightFt: 8,
 foulWallHeightM: 1.5,
 foulTerritoryM: 12,
 backstopM: 18
} as const;
/** Ground within this radius of the pitching rubber uses infield deceleration. */
export const INFIELD_CENTER: Vec2 = [0, 18.44];
export const INFIELD_RADIUS_M = 95 * FEET_TO_METERS;
const MAX_INTERPOLATION_STEP_DEG = 5;

export interface WallAnchorSource {
 label: string; bearingDeg: number; distanceFt: number | null; heightFt: number;
 provenance: { distance: Provenance; height: Provenance; bearing: Provenance };
}
/** One curated venue in `scripts/data/stadiums.json`. */
export interface StadiumSource {
 franchiseId: string; name: string; roof: 'none' | 'retractable' | 'fixed';
 elevationFt: { value: number; provenance: Provenance } | null;
 wall: WallAnchorSource[];
 notes: string[];
}

const reference = (note: string): Provenance => ({ kind: 'reference-condition', sourceUrl: null, note });
const estimated = (note: string): Provenance => ({ kind: 'estimated', sourceUrl: null, note });

export function referenceAirDensity(elevationM: number): number {
 if (!Number.isFinite(elevationM) || elevationM < -500 || elevationM > 5000) throw new Error('Invalid stadium elevation');
 return 1.225 * (1 - 2.25577e-5 * elevationM) ** 4.25588;
}

const point = (bearingDeg: number, distanceM: number): Vec2 => {
 const radians = bearingDeg * Math.PI / 180;
 return [distanceM * Math.sin(radians), distanceM * Math.cos(radians)];
};

function validateProvenance(value: Provenance, label: string): void {
 if (!value || !['source', 'estimated', 'reference-condition'].includes(value.kind) || typeof value.note !== 'string' ||
  (value.sourceUrl !== null && (typeof value.sourceUrl !== 'string' || !/^https:\/\//.test(value.sourceUrl))) ||
  (value.kind === 'source' && value.sourceUrl === null && !/foul line by definition/i.test(value.note))) {
  throw new Error(`Invalid stadium provenance: ${label}`);
 }
}

/** Builds metric geometry: piecewise-linear walls through anchors, subdivided at most every 5 degrees. */
export function buildStadium(source: StadiumSource, id: string): Omit<StadiumConfig, 'version'> {
 const label = `${source.franchiseId}:${source.name}`;
 if (!source.franchiseId || !source.name || !Array.isArray(source.wall) || !Array.isArray(source.notes)) throw new Error(`Invalid stadium source: ${label}`);
 if (source.roof === 'fixed') throw new Error(`Fixed-roof geometry is unsupported without overhead objects: ${label}`);
 if (source.roof !== 'none' && source.roof !== 'retractable') throw new Error(`Invalid stadium roof: ${label}`);
 const anchors = source.wall;
 for (const anchor of anchors) {
  if (anchor.distanceFt === null) throw new Error(`Missing sourced wall distance: ${label}:${anchor.label}`);
  if (!Number.isFinite(anchor.bearingDeg) || anchor.bearingDeg < -45 || anchor.bearingDeg > 45 || !Number.isFinite(anchor.distanceFt) ||
   anchor.distanceFt < 250 || anchor.distanceFt > 500 || !Number.isFinite(anchor.heightFt) || anchor.heightFt <= 0 || anchor.heightFt > 80) {
   throw new Error(`Invalid wall anchor: ${label}:${anchor.label}`);
  }
  validateProvenance(anchor.provenance?.distance, `${label}:${anchor.label}:distance`);
  validateProvenance(anchor.provenance?.height, `${label}:${anchor.label}:height`);
  validateProvenance(anchor.provenance?.bearing, `${label}:${anchor.label}:bearing`);
 }
 for (let index = 1; index < anchors.length; index++) {
  if (!(anchors[index].bearingDeg > anchors[index - 1].bearingDeg)) throw new Error(`Wall anchors must have strictly ascending bearings: ${label}`);
 }
 for (const required of [-45, 0, 45]) {
  if (!anchors.some(anchor => anchor.bearingDeg === required)) throw new Error(`Missing required wall anchor at ${required} degrees: ${label}`);
 }
 const fairPoints: Vec2[] = [];
 const fairHeights: number[] = [];
 const fairProvenance: FenceSegment['provenance'][] = [];
 for (let index = 0; index < anchors.length; index++) {
  const anchor = anchors[index];
  fairPoints.push(point(anchor.bearingDeg, anchor.distanceFt! * FEET_TO_METERS));
  if (index === anchors.length - 1) break;
  const next = anchors[index + 1];
  const steps = Math.ceil((next.bearingDeg - anchor.bearingDeg) / MAX_INTERPOLATION_STEP_DEG);
  const midpoint = (anchor.bearingDeg + next.bearingDeg) / 2;
  for (let step = 0; step < steps; step++) {
   const start = anchor.bearingDeg + (next.bearingDeg - anchor.bearingDeg) * step / steps;
   const end = anchor.bearingDeg + (next.bearingDeg - anchor.bearingDeg) * (step + 1) / steps;
   const nearer = (start + end) / 2 < midpoint ? anchor : next;
   fairHeights.push(nearer.heightFt * FEET_TO_METERS);
   const interpolated = steps > 1 || anchor.provenance.bearing.kind !== 'source' || next.provenance.bearing.kind !== 'source';
   fairProvenance.push({
    geometry: interpolated
     ? estimated(`Interpolated linearly in bearing between ${anchor.label} and ${next.label}.`)
     : { ...anchor.provenance.distance, note: `Straight wall between ${anchor.label} and ${next.label}.` },
    height: nearer.provenance.height
   });
   if (step < steps - 1) {
    const fraction = (step + 1) / steps;
    fairPoints.push(point(end, (anchor.distanceFt! + (next.distanceFt! - anchor.distanceFt!) * fraction) * FEET_TO_METERS));
   }
  }
 }
 const leftPole = fairPoints[0];
 const rightPole = fairPoints[fairPoints.length - 1];
 const foul = REFERENCE_CONDITIONS.foulTerritoryM / Math.SQRT2;
 const leftCorner: Vec2 = [leftPole[0] - foul, leftPole[1] - foul];
 const rightCorner: Vec2 = [rightPole[0] + foul, rightPole[1] - foul];
 const backstop = REFERENCE_CONDITIONS.backstopM;
 const boundary: Vec2[] = [[-backstop, -backstop], leftCorner, ...fairPoints, rightCorner, [backstop, -backstop]];
 const foulProvenance = {
  geometry: estimated('Foul territory is a simplified 12 m strip and 18 m backstop, not venue geometry.'),
  height: estimated('Foul-territory walls use a 1.5 m model height.')
 };
 const fences: FenceSegment[] = [];
 for (let index = 0; index < boundary.length; index++) {
  const start = boundary[index];
  const end = boundary[(index + 1) % boundary.length];
  const fairIndex = index - 2;
  const fair = fairIndex >= 0 && fairIndex < fairHeights.length;
  fences.push({ start, end, fair, heightM: fair ? fairHeights[fairIndex] : REFERENCE_CONDITIONS.foulWallHeightM, provenance: fair ? fairProvenance[fairIndex] : foulProvenance });
 }
 const elevationM = source.elevationFt ? source.elevationFt.value * FEET_TO_METERS : 0;
 if (source.elevationFt) validateProvenance(source.elevationFt.provenance, `${label}:elevation`);
 const dimensions: StadiumDimension[] = anchors.map(anchor => ({
  label: anchor.label, bearingDeg: anchor.bearingDeg, distanceFt: anchor.distanceFt!, heightFt: anchor.heightFt,
  distanceEstimated: anchor.provenance.distance.kind !== 'source',
  heightEstimated: anchor.provenance.height.kind !== 'source',
  bearingEstimated: anchor.provenance.bearing.kind !== 'source'
 }));
 const notices = [
  ...source.notes,
  'Walls are straight segments through cited anchors; points between anchors are interpolated estimates.',
  'Conditions are fixed reference conditions: no wind, open retractable roofs, and model surface and wall rebound values.'
 ];
 if (!source.elevationFt) notices.push('Elevation was not sourced; the sea-level estimate sets air density.');
 return {
  id, franchiseId: source.franchiseId, name: source.name, referenceYear: STADIUM_REFERENCE_YEAR,
  geometryVersion: GEOMETRY_VERSION, environmentVersion: ENVIRONMENT_VERSION,
  boundary, fences, overhead: [],
  roofState: source.roof === 'retractable' ? 'open' : 'none',
  airDensityKgM3: referenceAirDensity(elevationM),
  windMps: [...REFERENCE_CONDITIONS.windMps],
  infieldDecelerationMps2: REFERENCE_CONDITIONS.infieldDecelerationMps2,
  outfieldDecelerationMps2: REFERENCE_CONDITIONS.outfieldDecelerationMps2,
  wallRestitution: REFERENCE_CONDITIONS.wallRestitution,
  dimensions,
  provenance: {
   elevation: source.elevationFt?.provenance ?? estimated('Elevation unavailable; sea level assumed.'),
   airDensity: reference('1.225 kg/m^3 standard-atmosphere density adjusted for venue elevation.'),
   wind: reference('Fixed calm reference wind; not reconstructed 2025 weather.'),
   roof: reference(source.roof === 'retractable' ? 'Retractable roof treated as open.' : 'Open-air venue.'),
   surface: reference('Model rolling deceleration: 2.0 m/s^2 infield, 2.5 m/s^2 outfield.'),
   restitution: reference('Model wall restitution 0.55.'),
   foulTerritory: foulProvenance.geometry
  },
  notices
 };
}

/** Rounded 2025 MLB averages: line, gap, and center distances and wall heights; mean venue elevation. */
const NEUTRAL_SOURCE: StadiumSource = {
 franchiseId: 'NEUTRAL', name: 'Neutral reference park', roof: 'none', notes: [],
 elevationFt: { value: 500, provenance: reference('Rounded mean 2025 venue elevation.') },
 wall: [
  ['LF line', -45, 330], ['LCF', -22.5, 380], ['CF', 0, 400], ['RCF', 22.5, 380], ['RF line', 45, 330]
 ].map(([label, bearingDeg, distanceFt]) => ({
  label: label as string, bearingDeg: bearingDeg as number, distanceFt: distanceFt as number, heightFt: 10,
  provenance: { distance: reference('Rounded 2025 MLB average.'), height: reference('Rounded 2025 MLB average 10 ft wall.'), bearing: reference('Neutral calibration geometry.') }
 }))
};

let neutral: StadiumConfig | null = null;
/** The symmetric 330/380/400 ft, 10 ft wall, 500 ft elevation park used only for neutral calibration. */
export function neutralPark(): StadiumConfig {
 neutral ??= { ...buildStadium(NEUTRAL_SOURCE, 'neutral-reference'), version: 'neutral-reference-v2' };
 return neutral;
}

function finite(value: number): boolean { return typeof value === 'number' && Number.isFinite(value); }
function validPoint(value: Vec2): boolean { return Array.isArray(value) && value.length === 2 && finite(value[0]) && finite(value[1]); }
const cross = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;

export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
 const d1 = cross(d[0] - c[0], d[1] - c[1], a[0] - c[0], a[1] - c[1]);
 const d2 = cross(d[0] - c[0], d[1] - c[1], b[0] - c[0], b[1] - c[1]);
 const d3 = cross(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1]);
 const d4 = cross(b[0] - a[0], b[1] - a[1], d[0] - a[0], d[1] - a[1]);
 if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
 const onSegment = (p: Vec2, q: Vec2, r: Vec2) => Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
 return (d1 === 0 && onSegment(c, d, a)) || (d2 === 0 && onSegment(c, d, b)) || (d3 === 0 && onSegment(a, b, c)) || (d4 === 0 && onSegment(a, b, d));
}

export function simplePolygon(polygon: Vec2[]): boolean {
 const count = polygon.length;
 if (count < 3) return false;
 for (let left = 0; left < count; left++) for (let right = left + 1; right < count; right++) {
  if (right === left + 1 || (left === 0 && right === count - 1)) continue;
  if (segmentsIntersect(polygon[left], polygon[(left + 1) % count], polygon[right], polygon[(right + 1) % count])) return false;
 }
 return true;
}

export function pointInPolygon(x: number, y: number, polygon: readonly Vec2[]): boolean {
 let inside = false;
 for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
  const [xi, yi] = polygon[index];
  const [xj, yj] = polygon[previous];
  if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
 }
 return inside;
}

/** Structural validation for compiled and runtime stadium configurations. */
export function validateStadium(stadium: StadiumConfig): void {
 const label = stadium?.id ?? 'unknown';
 if (!stadium || typeof stadium.id !== 'string' || !stadium.id || typeof stadium.version !== 'string' || !stadium.version ||
  typeof stadium.franchiseId !== 'string' || !stadium.franchiseId || typeof stadium.name !== 'string' || !stadium.name ||
  stadium.referenceYear !== STADIUM_REFERENCE_YEAR || stadium.geometryVersion !== GEOMETRY_VERSION || stadium.environmentVersion !== ENVIRONMENT_VERSION) {
  throw new Error(`Invalid stadium identity: ${label}`);
 }
 const { boundary, fences, overhead } = stadium;
 if (!Array.isArray(boundary) || !boundary.every(validPoint) || !simplePolygon(boundary)) throw new Error(`Invalid stadium boundary: ${label}`);
 if (!pointInPolygon(0, 1, boundary)) throw new Error(`Stadium boundary must contain home plate: ${label}`);
 if (!Array.isArray(fences) || fences.length !== boundary.length) throw new Error(`Invalid stadium fences: ${label}`);
 fences.forEach((fence, index) => {
  const start = boundary[index];
  const end = boundary[(index + 1) % boundary.length];
  if (!validPoint(fence.start) || !validPoint(fence.end) || fence.start[0] !== start[0] || fence.start[1] !== start[1] || fence.end[0] !== end[0] || fence.end[1] !== end[1] ||
   !finite(fence.heightM) || fence.heightM <= 0 || typeof fence.fair !== 'boolean') throw new Error(`Invalid stadium fence ${index}: ${label}`);
  validateProvenance(fence.provenance?.geometry, `${label}:fence:${index}`);
  validateProvenance(fence.provenance?.height, `${label}:fence:${index}:height`);
 });
 if (!fences.some(fence => fence.fair)) throw new Error(`Stadium has no fair wall: ${label}`);
 if (!Array.isArray(overhead)) throw new Error(`Invalid stadium overhead objects: ${label}`);
 const overheadIds = new Set<string>();
 for (const item of overhead as OverheadObject[]) {
  if (!item.id || overheadIds.has(item.id) || !OVERHEAD_RULINGS.includes(item.ruling) || !finite(item.heightM) || item.heightM <= 0 ||
   !Array.isArray(item.polygon) || !item.polygon.every(validPoint) || !simplePolygon(item.polygon)) throw new Error(`Invalid overhead object: ${label}:${item.id}`);
  validateProvenance(item.provenance, `${label}:${item.id}`);
  overheadIds.add(item.id);
 }
 if (!['open', 'closed', 'none'].includes(stadium.roofState) || !finite(stadium.airDensityKgM3) || stadium.airDensityKgM3 <= 0 ||
  !Array.isArray(stadium.windMps) || stadium.windMps.length !== 3 || !stadium.windMps.every(finite) ||
  !finite(stadium.infieldDecelerationMps2) || stadium.infieldDecelerationMps2 <= 0 ||
  !finite(stadium.outfieldDecelerationMps2) || stadium.outfieldDecelerationMps2 <= 0 ||
  !finite(stadium.wallRestitution) || stadium.wallRestitution < 0 || stadium.wallRestitution > 1) throw new Error(`Invalid stadium environment: ${label}`);
 if (!Array.isArray(stadium.dimensions) || !stadium.dimensions.length || !Array.isArray(stadium.notices) || !stadium.provenance) throw new Error(`Invalid stadium disclosure: ${label}`);
 for (const [key, value] of Object.entries(stadium.provenance)) validateProvenance(value, `${label}:${key}`);
}

export function stadiumRef(stadium: StadiumConfig): ParkRef { return { id: stadium.id, version: stadium.version }; }

export function stadiumSummary(stadium: StadiumConfig, elevationFt: number | null): StadiumSummary {
 const fair = stadium.fences.filter(fence => fence.fair);
 const heights = stadium.dimensions.map(dimension => dimension.heightFt);
 return {
  ref: stadiumRef(stadium), franchiseId: stadium.franchiseId, name: stadium.name, referenceYear: stadium.referenceYear,
  roofState: stadium.roofState, elevationFt, dimensions: stadium.dimensions,
  wallHeightFt: { min: Math.min(...heights), max: Math.max(...heights) },
  outline: [fair[0].start, ...fair.map(fence => fence.end)].map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]),
  notices: stadium.notices
 };
}
