import { draftableCandidates, type Candidate } from '../game/types.ts';
import type { ParkRef } from '../sim/park-types.ts';

/** Park fit method: the home half-season run change against an average player at the same role. */
export const PARK_FIT_VERSION = 'park-fit-v1' as const;
/** Share of a season played in the home park. */
export const HOME_SHARE = 0.5;

/** One home park's fit for every card, stored as `draft-park-{franchiseId}.json`. */
export interface StoredParkFit {
 schemaVersion: 1;
 parkFitVersion: typeof PARK_FIT_VERSION;
 dataVersion: string;
 franchiseId: string;
 stadium: ParkRef;
 /** Tenths of a run, aligned to the draftable manifest candidates. */
 tenths: number[];
}

export type ParkFitTable = Omit<StoredParkFit, 'dataVersion'>;

/** Reads one stored park fit as runs by season id, rejecting other data or fit versions. */
export function decodeParkFit(manifestCandidates: readonly Candidate[], stored: StoredParkFit, dataVersion: string): Map<string, number> {
 const candidates = draftableCandidates(manifestCandidates);
 if (stored.schemaVersion !== 1 || stored.parkFitVersion !== PARK_FIT_VERSION) throw new Error(`Unsupported park fit ${String(stored.parkFitVersion)}`);
 if (stored.dataVersion !== dataVersion) throw new Error(`Park fit belongs to data ${stored.dataVersion}, not ${dataVersion}`);
 if (!Array.isArray(stored.tenths) || stored.tenths.length !== candidates.length || !stored.tenths.every(Number.isSafeInteger)) throw new Error(`Park fit for ${stored.franchiseId} does not align with the draftable candidates`);
 return new Map(candidates.map((candidate, index) => [candidate.seasonId, stored.tenths[index] / 10]));
}
