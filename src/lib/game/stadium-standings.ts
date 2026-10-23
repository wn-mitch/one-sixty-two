import type { Db } from '../storage/sql.ts';
import { storeReplay } from './share.ts';
import { deviceToken } from './standings.ts';
import type { Draft } from './types.ts';

export interface StadiumPlace { rank: number; total: number; topPercent: number }

/** Where an own season stands among every counted run at its home park. */
export interface StadiumStandingsView {
	/** The season this view belongs to, so a later season never shows an earlier one's place. */
	draft: Draft;
	stadium: string;
	wins: number;
	standing: StadiumPlace;
	total: number;
	/** Counted runs at each win total, best first, as `[wins, count]`. */
	distribution: [number, number][];
}

/** One park's counted runs, typical record and top-10% line. */
export interface ParkSummary { stadium: string; total: number; typical: number; top10: number; distribution: [number, number][] }

type FetchBoundary = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Answers that mean the run can never count; anything else (offline, 429, 5xx) throws. */
const REFUSED = new Set([400, 404, 409]);

/**
 * Submits an own completed season to its home park's standings and returns where it stands. The server
 * counts a replay once per device, so submitting the same season again only reads its place. Null when
 * the season has no home park or the server refuses it.
 */
export async function submitStadiumRun(db: Db, draft: Draft, wins: number, origin: string, fetcher: FetchBoundary = fetch): Promise<StadiumStandingsView | null> {
	if (!draft.homeStadium) return null;
	const replay = await storeReplay(draft, origin, fetcher);
	const response = await fetcher(new URL('/api/stadiums', origin), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ replayId: replay.id, token: await deviceToken(db), wins })
	});
	if (REFUSED.has(response.status)) return null;
	if (!response.ok) throw new Error(`Stadium standings answered ${response.status}`);
	const park = await response.json() as Omit<StadiumStandingsView, 'draft' | 'wins'>;
	return { draft, stadium: park.stadium, wins, standing: park.standing, total: park.total, distribution: park.distribution };
}

/** Every park with counted runs, by stadium id. */
export async function loadParkSummaries(origin: string, fetcher: FetchBoundary = fetch): Promise<Map<string, ParkSummary>> {
	const response = await fetcher(new URL('/api/stadiums', origin));
	if (!response.ok) throw new Error(`Stadium standings answered ${response.status}`);
	const { stadiums } = await response.json() as { stadiums: ParkSummary[] };
	return new Map(stadiums.map(park => [park.stadium, park]));
}
