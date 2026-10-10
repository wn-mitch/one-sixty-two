export const GEOMETRY_VERSION = 'park-geometry-v1' as const;
export const ENVIRONMENT_VERSION = 'fixed-air-v1' as const;
export const STADIUM_REFERENCE_YEAR = 2025 as const;
export const FEET_TO_METERS = 0.3048;

/** A stadium pin: `version` is the SHA-256 of the canonical configuration without its own version. */
export interface ParkRef { id: string; version: string }

/** "source" means the cited page states the value, not that the app measured it. */
export interface Provenance {
 kind: 'source' | 'estimated' | 'reference-condition';
 sourceUrl: string | null;
 note: string;
}
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

/** A vertical wall between two ground points; `fair` walls can be cleared for a home run. */
export interface FenceSegment {
 start: Vec2; end: Vec2; heightM: number; fair: boolean;
 provenance: { geometry: Provenance; height: Provenance };
}
export type OverheadRuling = 'live-rebound' | 'automatic-double' | 'home-run' | 'dead-ball';
export const OVERHEAD_RULINGS: readonly OverheadRuling[] = ['live-rebound', 'automatic-double', 'home-run', 'dead-ball'];
/** A bounded horizontal object; the ball collides when it crosses `heightM` inside the polygon. */
export interface OverheadObject { id: string; polygon: Vec2[]; heightM: number; ruling: OverheadRuling; provenance: Provenance }

/** A displayed wall anchor in source units. */
export interface StadiumDimension {
 label: string; bearingDeg: number; distanceFt: number; heightFt: number;
 distanceEstimated: boolean; heightEstimated: boolean; bearingEstimated: boolean;
}

export interface StadiumConfig {
 id: string; version: string; franchiseId: string; name: string;
 referenceYear: typeof STADIUM_REFERENCE_YEAR;
 geometryVersion: typeof GEOMETRY_VERSION; environmentVersion: typeof ENVIRONMENT_VERSION;
 /** Ordered closed ground polygon; fences are its edges in the same order. */
 boundary: Vec2[];
 fences: FenceSegment[];
 overhead: OverheadObject[];
 roofState: 'open' | 'closed' | 'none';
 airDensityKgM3: number;
 windMps: Vec3;
 infieldDecelerationMps2: number;
 outfieldDecelerationMps2: number;
 wallRestitution: number;
 dimensions: StadiumDimension[];
 provenance: {
  elevation: Provenance; airDensity: Provenance; wind: Provenance; roof: Provenance;
  surface: Provenance; restitution: Provenance; foulTerritory: Provenance;
 };
 notices: string[];
}

/** The display summary carried by the manifest. */
export interface StadiumSummary {
 ref: ParkRef; franchiseId: string; name: string; referenceYear: typeof STADIUM_REFERENCE_YEAR;
 roofState: StadiumConfig['roofState']; elevationFt: number | null;
 dimensions: StadiumDimension[];
 wallHeightFt: { min: number; max: number };
 /** Fair outline from the left-field pole to the right-field pole, in meters. */
 outline: Vec2[];
 notices: string[];
}
