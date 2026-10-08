import { average, innings } from './format.ts';
import { HITTER_SLOTS, SLOTS, compareId, type Profile, type Slot } from './types.ts';
import { teamRanks, type RankDirection } from './team-ranks.ts';
import type {
	AwardChip,
	AwardKey,
	AwardMetric,
	AwardTone,
	CreateResultsModelInput,
	InspectionDetailSection,
	InspectionSeasonView,
	ResultsCard,
	ResultsModel,
	TeamRank
} from './results-types.ts';
import { estimatedHitterWar, estimatedPitcherWar } from '../sim/value.ts';
import type { BatterLine, PitcherLine } from '../sim/types.ts';

export type {
	AwardChip,
	AwardKey,
	AwardMetric,
	AwardTone,
	CreateResultsModelInput,
	FeaturedResult,
	InspectionDetailRow,
	InspectionDetailSection,
	InspectionSeasonView,
	InspectionStat,
	ResultsCard,
	ResultsInspection,
	ResultsModel,
	TeamRank
} from './results-types.ts';

const EM_DASH = '—';

type CardRole = 'hitter' | 'pitcher' | 'bullpen';
type AwardCandidate = { id: string; value: number };
type InternalCard = {
	seasonId: string;
	slot: Slot;
	profile: Profile;
	role: CardRole;
	batter: BatterLine | null;
	pitcher: PitcherLine | null;
	estimatedWar: number | null;
};
type RawStat = {
	key: string;
	label: string;
	value: number | null;
	formattedValue: string;
	direction: RankDirection | null;
};
type AwardDefinition = {
	key: Exclude<AwardKey, 'home-runs'>;
	label: string;
	tone: AwardTone;
	direction: RankDirection;
	candidates: AwardCandidate[];
	format: (value: number) => string;
};
type AwardResult = AwardDefinition & { winners: AwardCandidate[]; featuredId: string; rawValue: number };

function finite(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function roleFor(slot: Slot): CardRole {
	if (slot === 'BP') return 'bullpen';
	return HITTER_SLOTS.includes(slot as typeof HITTER_SLOTS[number]) ? 'hitter' : 'pitcher';
}

function isEstimated(profile: Profile, family: 'batting' | 'pitching', field: string): boolean {
	return profile.estimatedFields.includes(`${family}.${field}.estimated`)
		|| (family === 'batting' && (
			((field === 'SB' || field === 'CS') && profile.estimatedFields.includes('baserunning.league'))
			|| (field === 'GIDP' && profile.estimatedFields.includes('doublePlay.league'))
		));
}

function measured(profile: Profile, family: 'batting' | 'pitching', field: string, value: unknown): number | null {
	return finite(value) && !isEstimated(profile, family, field) ? value : null;
}

function formatNumber(value: number | null, digits = 0): string {
	if (value === null) return EM_DASH;
	const formatted = value.toFixed(digits);
	return Number(formatted) === 0 ? (0).toFixed(digits) : formatted;
}

function formatRate(value: number | null): string {
	return value === null ? EM_DASH : average(value);
}

function formatRuns(value: number | null): string {
	if (value === null) return EM_DASH;
	const rounded = Number(value.toFixed(2));
	const normalized = Object.is(rounded, -0) ? 0 : rounded;
	return `${normalized > 0 ? '+' : ''}${normalized.toFixed(2)}`;
}

function simulatedStats(card: InternalCard): RawStat[] {
	if (card.role === 'hitter') {
		const line = card.batter!;
		const avg = line.AB > 0 ? line.H / line.AB : null;
		const obpDenominator = line.AB + line.BB + line.HBP + line.SF;
		const obp = obpDenominator > 0 ? (line.H + line.BB + line.HBP) / obpDenominator : null;
		const slg = line.AB > 0 ? (line.H + line.doubles + 2 * line.triples + 3 * line.HR) / line.AB : null;
		return [
			stat('war', 'Estimated WAR', card.estimatedWar, formatNumber(card.estimatedWar, 2), 'higher'),
			stat('avg', 'AVG', avg, formatRate(avg), 'higher'),
			stat('obp', 'OBP', obp, formatRate(obp), 'higher'),
			stat('slg', 'SLG', slg, formatRate(slg), 'higher'),
			stat('hr', 'HR', line.HR, String(line.HR), 'higher'),
			stat('h', 'H', line.H, String(line.H), 'higher'),
			stat('bb', 'BB', line.BB, String(line.BB), 'higher'),
			stat('sb', 'SB', line.SB, String(line.SB), 'higher')
		];
	}
	const line = card.pitcher!;
	const ra9 = line.outs > 0 ? line.R * 27 / line.outs : null;
	return [
		stat('war', 'Estimated WAR', card.estimatedWar, formatNumber(card.estimatedWar, 2), 'higher'),
		stat('g-gs', 'G / GS', null, `${line.appearances} / ${line.starts}`, null),
		stat('ip', 'IP', line.outs, innings(line.outs), 'higher'),
		stat('so', 'SO', line.SO, String(line.SO), 'higher'),
		stat('bb', 'BB', line.BB, String(line.BB), 'lower'),
		stat('ra9', 'RA9', ra9, formatNumber(ra9, 2), 'lower')
	];
}

function actualStats(card: InternalCard, rankings: CreateResultsModelInput['rankings']): RawStat[] {
	const ranking = rankings?.seasons[card.seasonId];
	if (card.role === 'hitter') {
		const batting = card.profile.batting;
		const value = (field: keyof NonNullable<Profile['batting']>) =>
			measured(card.profile, 'batting', field, batting?.[field]);
		const ab = value('AB'), h = value('H'), doubles = value('doubles'), triples = value('triples');
		const hr = value('HR'), bb = value('BB'), hbp = value('HBP'), sf = value('SF'), sb = value('SB');
		const avg = ab !== null && h !== null && ab > 0 ? h / ab : null;
		const obpDenominator = ab !== null && bb !== null && hbp !== null && sf !== null ? ab + bb + hbp + sf : 0;
		const obp = h !== null && bb !== null && hbp !== null && obpDenominator > 0
			? (h + bb + hbp) / obpDenominator : null;
		const slg = ab !== null && h !== null && doubles !== null && triples !== null && hr !== null && ab > 0
			? (h + doubles + 2 * triples + 3 * hr) / ab : null;
		const war = finite(ranking?.battingWAR162) ? ranking.battingWAR162 : null;
		return [
			stat('war', 'WAR / 162', war, formatNumber(war, 2), 'higher'),
			stat('avg', 'AVG', avg, formatRate(avg), 'higher'),
			stat('obp', 'OBP', obp, formatRate(obp), 'higher'),
			stat('slg', 'SLG', slg, formatRate(slg), 'higher'),
			stat('hr', 'HR', hr, formatNumber(hr), 'higher'),
			stat('h', 'H', h, formatNumber(h), 'higher'),
			stat('bb', 'BB', bb, formatNumber(bb), 'higher'),
			stat('sb', 'SB', sb, formatNumber(sb), 'higher')
		];
	}
	const pitching = card.profile.pitching;
	const value = (field: keyof NonNullable<Profile['pitching']>) =>
		measured(card.profile, 'pitching', field, pitching?.[field]);
	const g = value('G'), gs = value('GS'), outs = value('IPouts'), er = value('ER'), so = value('SO'), bb = value('BB');
	const era = outs !== null && er !== null && outs > 0 ? er * 27 / outs : null;
	const war = card.role === 'bullpen' || !finite(ranking?.pitchingWAR162) ? null : ranking.pitchingWAR162;
	return [
		stat('war', 'WAR / 162', war, formatNumber(war, 2), 'higher'),
		stat('g-gs', 'G / GS', null, `${formatNumber(g)} / ${formatNumber(gs)}`, null),
		stat('ip', 'IP', outs, outs === null ? EM_DASH : innings(outs), 'higher'),
		stat('so', 'SO', so, formatNumber(so), 'higher'),
		stat('bb', 'BB', bb, formatNumber(bb), 'lower'),
		stat('era', 'ERA', era, formatNumber(era, 2), 'lower')
	];
}

function stat(
	key: string,
	label: string,
	value: number | null,
	formattedValue: string,
	direction: RankDirection | null
): RawStat {
	return { key, label, value: finite(value) ? value : null, formattedValue, direction };
}

function rankedViews(cards: readonly InternalCard[], stats: readonly RawStat[][], label: InspectionSeasonView['label']): InspectionSeasonView[] {
	const output: InspectionSeasonView[] = cards.map(() => ({ label, rows: [], awardChips: [] }));
	for (const role of ['hitter', 'pitcher'] as const) {
		const indices = cards.flatMap((card, index) => card.role === role || (role === 'pitcher' && card.role === 'bullpen') ? [index] : []);
		const keys = new Set(indices.flatMap(index => stats[index].filter(row => row.direction).map(row => row.key)));
		const ranks = new Map<string, Map<string, TeamRank | null>>();
		for (const key of keys) {
			const representative = indices.map(index => stats[index].find(row => row.key === key)!).find(Boolean)!;
			ranks.set(key, teamRanks(indices.map(index => ({ id: cards[index].seasonId, value: stats[index].find(row => row.key === key)?.value ?? null })), representative.direction!));
		}
		for (const index of indices) {
			output[index] = {
				label,
				awardChips: [],
				rows: stats[index].map(row => ({
					key: row.key,
					label: row.label,
					formattedValue: row.formattedValue,
					rank: row.direction ? ranks.get(row.key)?.get(cards[index].seasonId) ?? null : null
				}))
			};
		}
	}
	return output;
}

function hitterParticipated(line: BatterLine): boolean {
	return line.PA > 0 || line.fieldingOuts > 0 || line.SB > 0 || line.CS > 0
		|| line.caughtAdvancing > 0 || line.stealRuns !== 0;
}

function pitcherParticipated(line: PitcherLine): boolean {
	return line.BF > 0 || line.outs > 0 || line.R > 0;
}

function awardResult(definition: AwardDefinition): AwardResult | null {
	if (!definition.candidates.length) return null;
	const values = definition.candidates.map(candidate => candidate.value);
	const rawValue = definition.direction === 'higher' ? Math.max(...values) : Math.min(...values);
	const winners = definition.candidates.filter(candidate => candidate.value === rawValue)
		.sort((left, right) => compareId(left.id, right.id));
	return { ...definition, winners, featuredId: winners[0].id, rawValue };
}

function awardMetric(award: AwardResult): AwardMetric {
	return {
		key: award.key,
		label: award.label,
		tone: award.tone,
		rawValue: award.rawValue,
		formattedValue: award.format(award.rawValue)
	};
}

function details(card: InternalCard): InspectionDetailSection[] {
	const sections: InspectionDetailSection[] = [];
	if (card.role === 'hitter') {
		const line = card.batter!;
		const replacement = 20 * line.PA / 600;
		sections.push({
			key: 'estimated-war',
			label: 'Estimated WAR breakdown',
			rows: [
				detail('batting-runs', 'Batting value', line.battingRuns, formatRuns(line.battingRuns)),
				detail('steal-runs', 'Running value', line.stealRuns, formatRuns(line.stealRuns)),
				detail('defensive-runs', 'Defensive value', line.defensiveRuns, formatRuns(line.defensiveRuns)),
				detail('replacement-runs', 'Replacement value', replacement, formatRuns(replacement)),
				detail('estimated-war', 'Estimated WAR', card.estimatedWar, formatNumber(card.estimatedWar, 2))
			],
			note: 'sim-war-v1 is an app-specific estimate: total realized batting, running, defense and replacement value divided by ten runs per win. It is not historical fWAR or bWAR.'
		});
		sections.push({
			key: 'realized-defense',
			label: 'Realized defensive value',
			rows: [
				detail('fielding-outs', 'Fielding workload (outs)', line.fieldingOuts, String(line.fieldingOuts)),
				detail('hit-prevention', 'Hit prevention', line.defensiveComponents.hitPrevention, formatRuns(line.defensiveComponents.hitPrevention)),
				detail('error-avoidance', 'Error avoidance', line.defensiveComponents.errorAvoidance, formatRuns(line.defensiveComponents.errorAvoidance)),
				detail('double-play', 'Double plays', line.defensiveComponents.doublePlay, formatRuns(line.defensiveComponents.doublePlay)),
				detail('outfield-throwing', 'Outfield throwing', line.defensiveComponents.outfieldThrowing, formatRuns(line.defensiveComponents.outfieldThrowing)),
				detail('catcher-throwing', 'Catcher throwing', line.defensiveComponents.catcherThrowing, formatRuns(line.defensiveComponents.catcherThrowing)),
			],
			note: 'defense-v1 reports realized above-average run contributions from the simulated season. Its component order is an accounting convention, not historical causal evidence.'
		});
	} else {
		const line = card.pitcher!;
		const replacement = card.role === 'bullpen' ? null : 20 * line.outs / 600;
		sections.push({
			key: 'estimated-war',
			label: 'Estimated WAR breakdown',
			rows: [
				detail('pitching-runs', 'Pitching value', line.pitchingRunsAboveNeutral, formatRuns(line.pitchingRunsAboveNeutral)),
				detail('replacement-runs', 'Replacement value', replacement, formatRuns(replacement)),
				detail('estimated-war', 'Estimated WAR', card.estimatedWar, formatNumber(card.estimatedWar, 2))
			],
			note: card.role === 'bullpen'
				? 'The drafted bullpen is a pooled team unit. It participates in team value accounting but has no individual estimated WAR.'
				: 'sim-war-v1 is an app-specific estimate: realized pitching value plus replacement value, divided by ten runs per win. It is not historical fWAR or bWAR.'
		});
	}
	return sections;
}

function detail(key: string, label: string, value: number | null, formattedValue: string) {
	return { key, label, value, formattedValue };
}

export function createResultsModel(input: CreateResultsModelInput): ResultsModel {
	const { result, draft, profiles, manifest, rankings } = input;
	if (result.dataVersion !== draft.dataVersion || manifest.dataVersion !== draft.dataVersion) {
		throw new Error('Results inputs use incompatible data versions.');
	}
	const profileById = new Map(profiles.map(profile => [profile.seasonId, profile]));
	const pickBySlot = new Map(draft.picks.map(pick => [pick.slot, pick]));
	const batterById = new Map(result.batting.map(line => [line.seasonId, line]));
	const pitcherById = new Map(result.pitching.map(line => [line.seasonId, line]));
	const internals = SLOTS.map(slot => {
		const pick = pickBySlot.get(slot);
		const profile = pick && profileById.get(pick.seasonId);
		if (!pick || !profile) throw new Error(`Missing result profile for ${slot}.`);
		const role = roleFor(slot);
		const batter = role === 'hitter' ? batterById.get(profile.seasonId) ?? null : null;
		const pitcher = role !== 'hitter' ? pitcherById.get(profile.seasonId) ?? null : null;
		if (role === 'hitter' && !batter || role !== 'hitter' && !pitcher) {
			throw new Error(`Missing result line for ${profile.seasonId}.`);
		}
		const estimatedWar = role === 'hitter'
			? estimatedHitterWar(batter!)
			: role === 'pitcher' ? estimatedPitcherWar(pitcher!) : null;
		return { seasonId: profile.seasonId, slot, profile, role, batter, pitcher, estimatedWar } satisfies InternalCard;
	});

	const simulatedRaw = internals.map(simulatedStats);
	const actualRaw = internals.map(card => actualStats(card, rankings));
	const simulatedViews = rankedViews(internals, simulatedRaw, '162-0 season');
	const actualViews = rankedViews(internals, actualRaw, 'Actual season');
	const participatingHitters = internals.filter(card => card.role === 'hitter' && hitterParticipated(card.batter!));
	const participatingPitchers = internals.filter(card => card.role === 'pitcher' && pitcherParticipated(card.pitcher!));
	const warCandidates = [...participatingHitters, ...participatingPitchers]
		.flatMap(card => finite(card.estimatedWar) ? [{ id: card.seasonId, value: card.estimatedWar }] : []);
	const awards = [
		awardResult({ key: 'mvp', label: 'MVP', tone: 'gold', direction: 'higher', candidates: warCandidates, format: value => `${formatNumber(value, 2)} WAR` }),
		awardResult({ key: 'batting-title', label: 'Batting title', tone: 'gold', direction: 'higher', candidates: participatingHitters.flatMap(card => card.batter!.AB > 0 ? [{ id: card.seasonId, value: card.batter!.H / card.batter!.AB }] : []), format: value => `${average(value)} AVG` }),
		awardResult({ key: 'runs-allowed', label: 'Fewest runs allowed', tone: 'gold', direction: 'lower', candidates: participatingPitchers.flatMap(card => card.pitcher!.outs > 0 ? [{ id: card.seasonId, value: card.pitcher!.R * 27 / card.pitcher!.outs }] : []), format: value => `${value.toFixed(2)} RA9` }),
		awardResult({ key: 'strikeouts', label: 'Strikeout leader', tone: 'gold', direction: 'higher', candidates: participatingPitchers.map(card => ({ id: card.seasonId, value: card.pitcher!.SO })), format: value => `${value} SO` }),
		awardResult({ key: 'lvp', label: 'LVP', tone: 'red', direction: 'lower', candidates: warCandidates, format: value => `${formatNumber(value, 2)} WAR` })
	].filter((award): award is AwardResult => award !== null);

	const chipsById = new Map<string, AwardChip[]>();
	const metricsById = new Map<string, AwardMetric[]>();
	const featuredOrder: string[] = [];
	for (const award of awards) {
		for (const winner of award.winners) {
			const chips = chipsById.get(winner.id) ?? [];
			chips.push({ key: award.key, label: award.label, tone: award.tone });
			chipsById.set(winner.id, chips);
		}
		if (!metricsById.has(award.featuredId)) featuredOrder.push(award.featuredId);
		const metrics = metricsById.get(award.featuredId) ?? [];
		metrics.push(awardMetric(award));
		metricsById.set(award.featuredId, metrics);
	}
	const featuredIds = new Set(featuredOrder);
	if (participatingHitters.length) {
		const maxHomeRuns = Math.max(...participatingHitters.map(card => card.batter!.HR));
		for (const card of participatingHitters) {
			if (featuredIds.has(card.seasonId) && card.batter!.HR === maxHomeRuns) {
				const chips = chipsById.get(card.seasonId) ?? [];
				chips.push({ key: 'home-runs', label: 'HR leader', tone: 'gold' });
				chipsById.set(card.seasonId, chips);
			}
		}
	}

	const cards = internals.map((card, index): ResultsCard => {
		const awardsForCard = chipsById.get(card.seasonId) ?? [];
		return {
			seasonId: card.seasonId,
			slot: card.slot,
			profile: card.profile,
			estimatedWar: card.estimatedWar,
			awards: awardsForCard,
			inspection: {
				seasonId: card.seasonId,
				slot: card.slot,
				simulated: { ...simulatedViews[index], awardChips: awardsForCard },
				actual: actualViews[index],
				details: details(card)
			}
		};
	});
	const cardById = new Map(cards.map(card => [card.seasonId, card]));
	const featured = featuredOrder.map(seasonId => ({
		card: cardById.get(seasonId)!,
		metrics: metricsById.get(seasonId)!
	}));
	return { cards, featured, rest: cards.filter(card => !featuredIds.has(card.seasonId)) };
}
