import { describe, expect, it } from 'vitest';
import type { WarRankings } from '../rankings/types.ts';
import { syntheticStadiumSummaries } from '../sim/fixtures.ts';
import { addPack, availableCandidates, choosePack, commitPick, createDraft, legalSlots, replayInput, rollDraft, selectHomeStadium } from './draft.ts';
import { obviousCard, SCOUTING_BANDS, scoutingLabel, scoutingReport } from './scouting.ts';
import { SLOTS, type Candidate, type Draft, type Manifest, type Slot } from './types.ts';

// Twenty clubs, each with a star (higher WAR/162) and a sleeper (more runs above replacement) at every slot.
const candidates: Candidate[] = Array.from({ length: 20 }, (_, club) => SLOTS.flatMap((slot, index) => (['star', 'sleeper'] as const).map(kind => ({
	seasonId: `${kind}${club}x${index}:1985:AL:T${club}`,
	playerId: `${kind}${club}x${index}`,
	franchiseId: `F${club.toString().padStart(2, '0')}`,
	decade: 1980,
	eligibleSlots: [slot]
})))).flat().sort((a, b) => a.seasonId < b.seasonId ? -1 : 1);

const manifest = {
	schemaVersion: 1, dataVersion: 'synthetic-scouting', sourceCommit: 'synthetic', jackpot: [], candidates, chunks: {},
	franchises: [...new Set(candidates.map(candidate => candidate.franchiseId))].map(id => ({ id, name: `Club ${id}`, decades: [1980] })),
	stadiums: syntheticStadiumSummaries([...new Set(candidates.map(candidate => candidate.franchiseId))]),
	simulationUrl: '', attributionUrl: '', showcaseUrl: '', archiveUrl: '', approximations: [], coverage: [],
	diagnostics: { excludedBatting: 0, excludedPitching: 0, excludedProfiles: 0, estimatedProfiles: 0, reportUrl: '' },
	attribution: { title: '', credit: '', sourceUrl: '', license: '', licenseUrl: '', sourceCommit: '', changes: '', fullNotice: '' }
} satisfies Manifest;

const club = (candidate: Candidate) => Number(candidate.franchiseId.slice(1));
const star = (candidate: Candidate) => candidate.seasonId.startsWith('star');
// Values and WAR differ by club too, so a pick from the wrong pack shows up in the edge.
const values = new Map(candidates.map(candidate => [candidate.seasonId, (star(candidate) ? 10 : 25) + club(candidate)]));
const war = (candidate: Candidate) => (star(candidate) ? 4 : 1) + club(candidate) / 100;
const rankings = {
	seasons: Object.fromEntries(candidates.map(candidate => [candidate.seasonId, { battingWAR162: war(candidate), pitchingWAR162: war(candidate) }]))
} as unknown as WarRankings;

/** Drafts a full roster, letting `choose` pick a card for the first open slot the table can fill. */
function draftWith(seed: number, choose: (offered: Candidate[], slot: Slot) => Candidate, extraPack = false): { draft: Draft; chalk: number; edge: number } {
	let draft = selectHomeStadium(createDraft(manifest, seed), manifest, manifest.stadiums[0].ref.id);
	let chalk = 0, edge = 0;
	while (draft.picks.length < SLOTS.length) {
		draft = rollDraft(draft, manifest);
		if (extraPack && draft.picks.length === 0) draft = addPack(draft, manifest);
		const table = draft.packs;
		const slot = SLOTS.find(open => !draft.picks.some(pick => pick.slot === open)
			&& table.some(pack => availableCandidates(draft, manifest, pack).some(candidate => legalSlots(draft, candidate, manifest).includes(open))))!;
		const offered = table.flatMap(pack => availableCandidates(draft, manifest, pack)).filter(candidate => legalSlots(draft, candidate, manifest).includes(slot));
		const taken = choose(offered, slot);
		const top = offered.reduce((best, candidate) => war(candidate) > war(best) ? candidate : best);
		chalk += Number(taken === top);
		edge += values.get(taken.seasonId)! - values.get(top.seasonId)!;
		if (table.length > 1) draft = choosePack(draft, table.findIndex(pack => availableCandidates(draft, manifest, pack).includes(taken)));
		draft = commitPick(draft, manifest, taken.seasonId, slot);
	}
	return { draft, chalk, edge };
}

describe('scouting grade', () => {
	it('counts every pick of the list’s first card as chalk with no edge', () => {
		const { draft } = draftWith(3, (offered, slot) => obviousCard(offered, slot, rankings));
		expect(scoutingReport(replayInput(draft), manifest, values, rankings)).toMatchObject({ chalk: 16, edge: 0 });
	});

	it('rebuilds each pick’s offer from the replay exactly as the draft saw it', () => {
		const sleeper = (offered: Candidate[]) => offered.find(candidate => !star(candidate)) ?? offered[0];
		const live = draftWith(8, sleeper);
		const report = scoutingReport(replayInput(live.draft), manifest, values, rankings);
		expect(live.edge).toBeGreaterThan(0);
		expect(report).toMatchObject({ chalk: live.chalk, edge: live.edge });
	});

	it('measures a pick against the best card in a pack the player passed up', () => {
		// The first pick takes the weaker club's star, so the stronger club's star in the other pack is the obvious card.
		const weakerStar = (offered: Candidate[]) => offered.filter(star).reduce((low, candidate) => club(candidate) < club(low) ? candidate : low);
		const live = draftWith(11, weakerStar, true);
		const report = scoutingReport(replayInput(live.draft), manifest, values, rankings);
		expect(live.chalk).toBe(15);
		expect(live.edge).toBeLessThan(0);
		expect(report).toMatchObject({ chalk: live.chalk, edge: live.edge });
	});

	it('ranks unranked cards last and breaks WAR ties by season id', () => {
		const [a, b, c] = candidates.slice(0, 3);
		const tied = { seasons: { [a.seasonId]: { battingWAR162: 2, pitchingWAR162: null }, [b.seasonId]: { battingWAR162: 2, pitchingWAR162: null } } } as unknown as WarRankings;
		expect(obviousCard([c, b, a], 'C', tied)).toBe(a);
		expect(obviousCard([c, b], 'SP1', tied)).toBe(b);
	});

	it('takes the first matching band', () => {
		expect(scoutingLabel(16, SCOUTING_BANDS.scoutEdge)).toBe('Talent scout');
		expect(scoutingLabel(16, SCOUTING_BANDS.offEdge)).toBe('Off the board');
		expect(scoutingLabel(SCOUTING_BANDS.bookChalk, (SCOUTING_BANDS.scoutEdge + SCOUTING_BANDS.offEdge) / 2)).toBe('By the book');
		expect(scoutingLabel(SCOUTING_BANDS.bookChalk - 1, (SCOUTING_BANDS.scoutEdge + SCOUTING_BANDS.offEdge) / 2)).toBe('Sharp eye');
	});
});
