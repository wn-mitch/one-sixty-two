import { loadDraftCards } from '../draft/load.ts';
import type { WarRankings } from '../rankings/types.ts';
import { pickOffers } from './draft.ts';
import { compareId, HITTER_SLOTS, type Candidate, type Manifest, type Replay, type Slot } from './types.ts';

export type ScoutingLabel = 'Talent scout' | 'Off the board' | 'By the book' | 'Sharp eye';

export interface ScoutingReport {
	/** Picks that took the card the list showed first. */
	chalk: number;
	/** Summed `valueRuns` gained, or lost when negative, against the list's first card at every pick. */
	edge: number;
	label: ScoutingLabel;
}

/**
 * Bands from native calibration drafts (`just draft-spread random,best,vorp,packs,chalk 1 1000`).
 * A talent scout gains at least the 25th-percentile edge of drafting by runs above replacement
 * (+44 runs, about two wins); off the board loses as much, which every random draft and almost no
 * draft by OPS or ERA does; by the book takes the list's first card at least as often as the
 * busiest tenth of runs-above-replacement drafts (12 of 16). Refit when card values, rankings or
 * draft rules change.
 */
export const SCOUTING_BANDS = { scoutEdge: 44, offEdge: -44, bookChalk: 12 } as const;

/** The first matching band sets the label. */
export function scoutingLabel(chalk: number, edge: number): ScoutingLabel {
	if (edge >= SCOUTING_BANDS.scoutEdge) return 'Talent scout';
	if (edge <= SCOUTING_BANDS.offEdge) return 'Off the board';
	if (chalk >= SCOUTING_BANDS.bookChalk) return 'By the book';
	return 'Sharp eye';
}

/** The card the candidate list's default WAR/162 order shows first for `slot`: unranked cards last, ties to the lower season id. */
export function obviousCard(offered: readonly Candidate[], slot: Slot, rankings: WarRankings): Candidate {
	const key = (HITTER_SLOTS as readonly Slot[]).includes(slot) ? 'battingWAR162' : 'pitchingWAR162';
	const war = (candidate: Candidate) => rankings.seasons[candidate.seasonId]?.[key] ?? null;
	return offered.reduce((top, candidate) => {
		const [value, best] = [war(candidate), war(top)];
		if (value !== null && best !== null) return value > best || (value === best && compareId(candidate.seasonId, top.seasonId) < 0) ? candidate : top;
		if (value !== best) return value === null ? top : candidate;
		return compareId(candidate.seasonId, top.seasonId) < 0 ? candidate : top;
	});
}

/** The scouting grade of a complete replay; `values` holds every draftable card's `valueRuns`. */
export function scoutingReport(replay: Replay, manifest: Manifest, values: ReadonlyMap<string, number>, rankings: WarRankings): ScoutingReport {
	let chalk = 0, edge = 0;
	for (const { seasonId, slot, offered } of pickOffers(replay, manifest)) {
		const top = obviousCard(offered, slot, rankings);
		const [taken, obvious] = [values.get(seasonId), values.get(top.seasonId)];
		if (taken === undefined || obvious === undefined) throw new Error(`No card value for ${taken === undefined ? seasonId : top.seasonId}`);
		if (top.seasonId === seasonId) chalk++;
		edge += taken - obvious;
	}
	return { chalk, edge, label: scoutingLabel(chalk, edge) };
}

const cardValues = new WeakMap<Manifest, Promise<Map<string, number>>>();

/** Every draftable card's `valueRuns` for the manifest's data version, fetched once per manifest; a failed fetch is retried next call. */
export function loadCardValues(manifest: Manifest): Promise<Map<string, number>> {
	let values = cardValues.get(manifest);
	if (!values) {
		values = loadDraftCards(manifest).then(cards => new Map(cards.map(card => [card.seasonId, card.valueRuns])));
		values.catch(() => cardValues.delete(manifest));
		cardValues.set(manifest, values);
	}
	return values;
}

/** The scout edge as Results states it, in whole runs against the obvious picks. */
export function scoutEdgeText(edge: number): string {
	const runs = Math.round(edge);
	if (runs === 0) return 'Even with the obvious picks';
	return `${runs > 0 ? '+' : '−'}${Math.abs(runs)} ${Math.abs(runs) === 1 ? 'run' : 'runs'} ${runs > 0 ? 'over' : 'under'} the obvious picks`;
}
