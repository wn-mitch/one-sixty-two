import { average, historicalBatting, historicalEra, innings } from '../game/format.ts';
import { POSITIONS } from '../game/types.ts';
import type { Manifest, Profile, Slot } from '../game/types.ts';
import { selectLogo, selectPhoto } from '../media/client.ts';
import type { MediaAsset, MediaManifest, PlayerPhoto } from '../media/types.ts';
import type { WarSeasonRanking, WarRankings } from '../rankings/types.ts';
import { seasonEstimates } from '../components/season-estimates.ts';
import { isHitter } from '../components/candidate-ranking.ts';
import { STOCK, roles } from './tokens.ts';
import type { Roles } from './tokens.ts';
import { finishFor, materialFor } from './finish.ts';
import type { FinishMaterial, FinishRole } from './finish.ts';

export type CardEra = '1950s' | '1960s' | '1970s' | '1980s' | '1990s' | '2000s' | '2010s' | '2020s';
export type CardRole = 'batting' | 'pitching' | 'bullpen';
export type CardMediaStatus = 'loading' | 'ready' | 'unavailable';

export interface CardStat { l: string; v: string; role?: 'BAT' | 'PIT'; name?: string }
export interface CardMedia {
	url: string;
	year?: number;
	selectedSeason?: boolean;
	credit: string;
	license: string;
	licenseUrl: string;
	sourceUrl: string;
	captureEvidenceUrl?: string;
	identityEvidenceUrl?: string;
	historical?: boolean;
}
export interface CardFamily {
	title: string;
	key: readonly CardStat[];
	counts: readonly CardStat[];
	cols: 4 | 5 | 7 | 9;
}
export interface CardFamilySize { k: number; c: number; l: number }
export interface CardPosition { on: boolean; off: boolean; g: string }
export interface CardPositions {
	c: CardPosition; b1: CardPosition; b2: CardPosition; b3: CardPosition; ss: CardPosition;
	lf: CardPosition; cf: CardPosition; rf: CardPosition; p: CardPosition; dh: CardPosition;
}
export interface CardBack {
	dia: CardPositions;
	showDia: boolean;
	posCode: string;
	name: string;
	given: string;
	family: string;
	team: string;
	seasonLine: string;
	playerLine: string;
	fams: readonly CardFamily[];
	sz: CardFamilySize;
	cols: 4 | 5;
	hasApps: boolean;
	appsText: boolean;
	appsLabel: string;
	apps: string;
	hasWar: boolean;
	war: string;
	isBullpen: boolean;
	pool: string;
	srcStats: string;
	srcPhoto: string;
	srcCue: string;
}
export interface SupplementalRow { k: string; v: string; href?: string }
export interface SupplementalSection { h: string; rows: readonly SupplementalRow[] }
export interface Supplemental { title: string; sections: readonly SupplementalSection[] }
export interface CardFront {
	era: CardEra;
	cardRole: CardRole;
	given: string;
	family: string;
	full: string;
	team: string;
	nick: string;
	abbr: string;
	year: string;
	pos: string;
	st1: CardStat;
	st2: CardStat;
	st3: CardStat;
	photo: string;
	selectedPhoto: CardMedia | null;
	hasPhoto: boolean;
	noPhoto: boolean;
	photoNote: string;
	caption: string;
	logo: string;
	selectedLogo: CardMedia | null;
	hasLogo: boolean;
	noLogo: boolean;
	logoLabel: string;
	k: Roles;
	fin: Readonly<FinishMaterial>;
	mediaStatus: CardMediaStatus;
}
export interface CardViewModel extends CardFront { b: CardBack; details: Supplemental }
export interface CreateCardViewModelInput {
	profile: Profile;
	slot?: Slot | null;
	ranking?: WarSeasonRanking | null;
	war?: number | null;
	media?: MediaManifest | null;
	mediaStatus?: CardMediaStatus;
	manifest?: Manifest | null;
	rankings?: WarRankings | null;
}

const SINGLE_SIZE: CardFamilySize = { k: 11, c: 8, l: 3.4 };
const TWO_SIZE: CardFamilySize = { k: 5.6, c: 4.4, l: 2.7 };
const EM_DASH = '—';
const HAND: Record<string, string> = { L: 'Left', R: 'Right', B: 'Both' };


function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function count(value: unknown): string { return finite(value) && value >= 0 ? String(value) : EM_DASH; }
function decimal(value: unknown, digits: number): string { return finite(value) ? value.toFixed(digits) : EM_DASH; }
function initials(value: string): string { return value.split(/\s+/).filter(Boolean).map(word => word[0]).join('').toUpperCase() || EM_DASH; }
function names(full: string): { given: string; family: string } {
	const parts = full.trim().split(/\s+/).filter(Boolean);
	return { given: parts[0] ?? EM_DASH, family: parts.slice(1).join(' ') || parts[0] || EM_DASH };
}
function isEstimated(profile: Profile, family: 'batting' | 'pitching', field: string): boolean {
	return profile.estimatedFields.includes(`${family}.${field}.estimated`)
		|| (family === 'batting' && (
			((field === 'SB' || field === 'CS') && profile.estimatedFields.includes('baserunning.league'))
			|| (field === 'GIDP' && profile.estimatedFields.includes('doublePlay.league'))
		));
}
function statistic(profile: Profile, family: 'batting' | 'pitching', field: string, value: unknown): string {
	return isEstimated(profile, family, field) ? EM_DASH : count(value);
}
function validBatting(profile: Profile): boolean {
	const batting = profile.batting;
	return !!batting && [batting.AB, batting.H, batting.doubles, batting.triples, batting.HR, batting.BB, batting.HBP, batting.SF].every(finite)
		&& batting.AB > 0 && batting.AB + batting.BB + batting.HBP + batting.SF > 0;
}
function validPitching(profile: Profile): boolean {
	const pitching = profile.pitching;
	return !!pitching && [pitching.ER, pitching.IPouts].every(finite) && pitching.IPouts > 0;
}
function battingDerived(profile: Profile): CardStat[] {
	if (!validBatting(profile)) return ['AVG', 'OBP', 'SLG', 'OPS'].map(l => ({ l, v: EM_DASH }));
	const batting = profile.batting!;
	const values = historicalBatting(batting);
	const unknown = (fields: readonly string[]) => fields.some(field => isEstimated(profile, 'batting', field));
	return [
		{ l: 'AVG', v: unknown(['H', 'AB']) ? EM_DASH : average(values.avg) },
		{ l: 'OBP', v: unknown(['H', 'AB', 'BB', 'HBP', 'SF']) ? EM_DASH : average(values.obp) },
		{ l: 'SLG', v: unknown(['H', 'AB', 'doubles', 'triples', 'HR']) ? EM_DASH : average(values.slg) },
		{ l: 'OPS', v: unknown(['H', 'AB', 'BB', 'HBP', 'SF', 'doubles', 'triples', 'HR']) ? EM_DASH : average(values.ops) }
	];
}
function pitchingDerived(profile: Profile): CardStat[] {
	const pitching = profile.pitching;
	if (!pitching || !validPitching(profile)) return [{ l: 'ERA', v: EM_DASH }, { l: 'WHIP', v: EM_DASH }, { l: 'IP', v: EM_DASH }, { l: 'SO', v: EM_DASH }];
	const whip = finite(pitching.BB) && finite(pitching.H) ? (pitching.BB + pitching.H) / (pitching.IPouts / 3) : NaN;
	return [
		{ l: 'ERA', v: isEstimated(profile, 'pitching', 'ER') || isEstimated(profile, 'pitching', 'IPouts') ? EM_DASH : decimal(historicalEra(pitching), 2) },
		{ l: 'WHIP', v: ['BB', 'H', 'IPouts'].some(field => isEstimated(profile, 'pitching', field)) ? EM_DASH : decimal(whip, 2) },
		{ l: 'IP', v: isEstimated(profile, 'pitching', 'IPouts') ? EM_DASH : innings(pitching.IPouts) },
		{ l: 'SO', v: statistic(profile, 'pitching', 'SO', pitching.SO) }
	];
}
function battingFamily(profile: Profile, title: string): CardFamily {
	const batting = profile.batting;
	return {
		title, key: battingDerived(profile), cols: 5,
		counts: ([['PA', 'PA', batting?.PA], ['AB', 'AB', batting?.AB], ['H', 'H', batting?.H], ['2B', 'doubles', batting?.doubles], ['3B', 'triples', batting?.triples], ['HR', 'HR', batting?.HR], ['BB', 'BB', batting?.BB], ['SO', 'SO', batting?.SO], ['HBP', 'HBP', batting?.HBP], ['SH', 'SH', batting?.SH], ['SF', 'SF', batting?.SF], ['SB', 'SB', batting?.SB], ['CS', 'CS', batting?.CS], ['GIDP', 'GIDP', batting?.GIDP]] satisfies [string, string, number | undefined][]).map(([l, field, value]) => ({ l, v: statistic(profile, 'batting', field, value) }))
	};
}
function pitchingFamily(profile: Profile, title: string, members?: number): CardFamily {
	const pitching = profile.pitching;
	const key = pitchingDerived(profile);
	if (members !== undefined) {
		key.splice(1, 1, { l: 'IP', v: key[2].v }, { l: 'SO', v: key[3].v }, { l: 'Members', v: String(members) });
		key.length = 4;
	}
	return {
		title, key, cols: 5,
		counts: ([['G', 'G', pitching?.G], ['GS', 'GS', pitching?.GS], ['BFP', 'BFP', pitching?.BFP], ['H', 'H', pitching?.H], ['ER', 'ER', pitching?.ER], ['HR', 'HR', pitching?.HR], ['BB', 'BB', pitching?.BB], ['HBP', 'HBP', pitching?.HBP], ['SV', 'SV', pitching?.SV]] satisfies [string, string, number | undefined][]).map(([l, field, value]) => ({ l, v: statistic(profile, 'pitching', field, value) }))
	};
}

export function eraForYear(year: number): CardEra {
	const decade = finite(year) ? Math.min(2020, Math.max(1950, Math.floor(year / 10) * 10)) : 1950;
	return `${decade}s` as CardEra;
}
export function cardRole(profile: Pick<Profile, 'bullpen' | 'eligibleSlots'>, slot?: Slot | null): CardRole {
	if (profile.bullpen || slot === 'BP') return 'bullpen';
	if (slot) return isHitter(slot) ? 'batting' : 'pitching';
	return profile.eligibleSlots.some(isHitter) ? 'batting' : 'pitching';
}
function position(profile: Profile, slot: Slot | null | undefined, role: CardRole): string {
	if (role === 'bullpen') return 'BP';
	if (slot && slot !== 'BP') return slot;
	const batting = profile.eligibleSlots.find(isHitter);
	const pitching = profile.eligibleSlots.find(value => !isHitter(value) && value !== 'BP');
	if (batting && pitching) return `${batting} · ${pitching.replace(/[123]$/, '')}`;
	return (role === 'batting' ? batting : pitching) ?? EM_DASH;
}
function selectedPhoto(photo: PlayerPhoto, year: number): CardMedia {
	return { url: photo.url, year: photo.year, selectedSeason: photo.year === year, credit: photo.credit || 'credit unverified', license: photo.license || 'credit unverified', licenseUrl: photo.licenseUrl, sourceUrl: photo.sourceUrl, captureEvidenceUrl: photo.captureEvidenceUrl, identityEvidenceUrl: photo.identityEvidenceUrl };
}
function selectedLogo(asset: MediaAsset, historical: boolean): CardMedia {
	return { url: asset.url, credit: asset.credit || 'credit unverified', license: asset.license || 'credit unverified', licenseUrl: asset.licenseUrl, sourceUrl: asset.sourceUrl, historical };
}
function spot(value: unknown, extra = ''): CardPosition {
	const active = finite(value) && value > 0;
	return { on: active || !!extra, off: !active && !extra, g: active ? String(value) : extra };
}
function positions(profile: Profile, hasPitching: boolean): CardPositions {
	const appearances = profile.appearances ?? {};
	const hasFielding = POSITIONS.some(position => finite(appearances[position]) && appearances[position]! > 0);
	const pitchingGames = hasPitching ? profile.pitching?.G : undefined;
	return {
		c: spot(appearances.C), b1: spot(appearances['1B']), b2: spot(appearances['2B']), b3: spot(appearances['3B']), ss: spot(appearances.SS),
		lf: spot(appearances.LF), cf: spot(appearances.CF), rf: spot(appearances.RF), p: spot(pitchingGames),
		dh: spot(undefined, profile.eligibleSlots.includes('DH') && !hasFielding ? 'only' : '')
	};
}
function apps(profile: Profile, hasPitching: boolean): string {
	const positionApps = POSITIONS.flatMap(position => {
		const games = profile.appearances?.[position];
		return finite(games) && games > 0 ? [[position, games] as const] : [];
	}).sort(([, left], [, right]) => right - left).map(([position, games]) => `${position} ${games}`);
	if (hasPitching && finite(profile.pitching?.G) && profile.pitching!.G > 0) {
		const starts = finite(profile.pitching?.GS) && profile.pitching!.GS > 0 ? ` (${profile.pitching!.GS} GS)` : '';
		positionApps.push(`P ${profile.pitching!.G}${starts}`);
	}
	if (positionApps.length) return positionApps.join(' · ');
	if (profile.eligibleSlots.includes('DH')) return 'DH only · no fielding games';
	return EM_DASH;
}
function warText(hasBatting: boolean, hasPitching: boolean, ranking: WarSeasonRanking | null): string {
	const entries = [
		hasBatting && finite(ranking?.battingWAR162) ? `Bat WAR/162 ${ranking!.battingWAR162.toFixed(2)}` : '',
		hasPitching && finite(ranking?.pitchingWAR162) ? `Pit WAR/162 ${ranking!.pitchingWAR162.toFixed(2)}` : ''
	].filter(Boolean);
	return entries.length ? `${entries.join(' · ')} · rank only` : '';
}
function photoRows(photo: CardMedia | null, year: number, modifications: string | undefined, mediaStatus: CardMediaStatus): SupplementalSection {
	if (!photo) {
		const status = mediaStatus === 'loading'
			? 'Verified photo availability is loading.'
			: mediaStatus === 'unavailable'
				? 'Photo source is unavailable. The season remains fully draftable.'
				: 'No verified playing-career photo is published. No substitute face is shown.';
		return { h: 'Photo', rows: [{ k: 'Status', v: status }] };
	}
	return { h: 'Photo', rows: [
		{ k: 'Year', v: `${photo.year} · ${photo.selectedSeason ? 'selected season' : `career photo for ${year}`}` },
		{ k: 'Verification', v: photo.selectedSeason ? 'The verified playing-career photo matches the drafted season.' : `This is a verified playing-career image, not a photo from the drafted ${year} season.` },
		{ k: 'Credit', v: photo.credit }, { k: 'Licence', v: photo.license, href: photo.licenseUrl },
		{ k: 'Source', v: photo.sourceUrl, href: photo.sourceUrl },
		{ k: 'Changes', v: modifications || 'Image modifications unavailable' },
		...(photo.captureEvidenceUrl ? [{ k: 'Capture-date evidence', v: photo.captureEvidenceUrl, href: photo.captureEvidenceUrl }] : []),
		...(photo.identityEvidenceUrl ? [{ k: 'Player-identity evidence', v: photo.identityEvidenceUrl, href: photo.identityEvidenceUrl }] : [])
	] };
}
function logoRows(logo: CardMedia | null, mediaStatus: CardMediaStatus): SupplementalSection {
	if (!logo) {
		const status = mediaStatus === 'loading'
			? 'Verified team mark availability is loading.'
			: mediaStatus === 'unavailable'
				? 'Team mark source is unavailable.'
				: 'No verified team mark is published.';
		return { h: 'Team mark', rows: [{ k: 'Status', v: status }] };
	}
	return { h: 'Team mark', rows: [
		{ k: 'Status', v: logo.historical ? 'Verified historical team mark' : 'Current franchise mark' },
		{ k: 'Credit', v: logo.credit }, { k: 'Licence', v: logo.license, href: logo.licenseUrl },
		{ k: 'Source', v: logo.sourceUrl, href: logo.sourceUrl }
	] };
}
function finishRole(profile: Profile, slot: Slot | null | undefined, role: CardRole): FinishRole {
	if (role === 'bullpen') return 'bullpen';
	if (role === 'batting') return 'hitter';
	return slot === 'CL' || (!slot && profile.eligibleSlots.includes('CL') && !profile.eligibleSlots.some(value => value.startsWith('SP'))) ? 'closer' : 'starter';
}

export function createCardViewModel(input: CreateCardViewModelInput): CardViewModel {
	const { profile, slot = null, media = null, manifest = null, rankings = null, mediaStatus = 'ready' } = input;
	const ranking = input.ranking ?? rankings?.seasons[profile.seasonId] ?? null;
	const role = cardRole(profile, slot);
	const pos = position(profile, slot, role);
	const hasBatting = !profile.bullpen && profile.eligibleSlots.some(isHitter) && !!profile.batting;
	const hasPitching = !profile.bullpen && profile.eligibleSlots.some(value => !isHitter(value)) && !!profile.pitching;
	const photo = profile.bullpen ? null : selectPhoto(media, profile.playerId, profile.year);
	const logo = selectLogo(media, profile.franchiseId, profile.year);
	const cardPhoto = photo ? selectedPhoto(photo, profile.year) : null;
	const cardLogo = logo ? selectedLogo(logo.asset, logo.historical) : null;
	const roleWar = role === 'batting' ? ranking?.battingWAR162 : ranking?.pitchingWAR162;
	const displayedWar = role === 'bullpen' ? undefined : finite(input.war) ? input.war : roleWar;
	const battingKey = battingDerived(profile);
	const pitchingKey = pitchingDerived(profile);
	const frontStats = role === 'batting'
		? [{ l: 'BAT WAR/162', v: decimal(displayedWar, 2), role: 'BAT' as const, name: 'WAR/162' }, { ...battingKey[3], role: 'BAT' as const }, { l: 'HR', v: statistic(profile, 'batting', 'HR', profile.batting?.HR), role: 'BAT' as const }]
		: [{ l: 'PIT WAR/162', v: decimal(displayedWar, 2), role: 'PIT' as const, name: 'WAR/162' }, { ...pitchingKey[0], role: 'PIT' as const }, { l: 'SO', v: statistic(profile, 'pitching', 'SO', profile.pitching?.SO), role: 'PIT' as const }];
	const families: CardFamily[] = profile.bullpen
		? [pitchingFamily(profile, `Pooled relief · ${profile.year}`, profile.bullpen.members.length)]
		: [
			...(hasBatting ? [battingFamily(profile, hasPitching ? 'Batting' : `Batting · ${profile.year}`)] : []),
			...(hasPitching ? [pitchingFamily(profile, hasBatting ? 'Pitching' : `Pitching · ${profile.year}`)] : [])
		];
	for (const family of families) {
		if (families.length === 1) family.cols = 5;
		else family.cols = family.counts.length > 10 ? 7 : 9;
	}
	const team = profile.historicalTeam || media?.teams[profile.franchiseId]?.name || profile.franchiseId;
	const name = profile.bullpen ? { given: team, family: 'Bullpen' } : names(profile.displayName);
	const fullName = profile.bullpen ? `${team} bullpen` : profile.displayName || EM_DASH;
	const nickname = (team.match(/(?:Red Sox|White Sox|Blue Jays|Devil Rays)(?:$| of )/i)?.[0].replace(/ of $/, '')
		?? team.replace(/ of .+$/, '').trim().split(/\s+/).at(-1))?.toUpperCase() || EM_DASH;
	const attribution = manifest?.attribution;
	const statSource = attribution ? 'Stats · historical source · Details' : 'Statistics provenance unavailable';
	const statisticsSource: SupplementalSection = {
		h: 'Statistics source',
		rows: attribution ? [
			{ k: 'Season ID', v: profile.seasonId },
			{ k: 'Database', v: attribution.title, href: attribution.sourceUrl },
			{ k: 'Licence', v: attribution.license, href: attribution.licenseUrl },
			{ k: 'Changes', v: attribution.changes }
		] : [
			{ k: 'Season ID', v: profile.seasonId },
			{ k: 'Status', v: 'Statistics provenance is unavailable.' }
		]
	};
	const estimates = seasonEstimates(profile, profile.eligibleSlots, slot);
	const modelContext: SupplementalRow[] = [
		{ k: 'Environment', v: 'This historical season is adjusted into the common 2025 environment. WAR/162 ranks choices only and is not a simulation input.' },
		{ k: 'Simulation', v: 'How the simulation works', href: '/about#simulation' }
	];
	let logoLabel = 'No verified team mark';
	if (cardLogo) logoLabel = cardLogo.historical ? 'Verified historical team mark' : 'Current franchise mark';
	else if (mediaStatus === 'loading') logoLabel = 'Loading team mark';
	else if (mediaStatus === 'unavailable') logoLabel = 'Team mark source unavailable';
	let photoSource = profile.bullpen ? 'Team-season pool · no photo' : 'No photo';
	if (cardPhoto) photoSource = `Photo ${cardPhoto.year} · licence in Details`;
	else if (!profile.bullpen && mediaStatus === 'loading') photoSource = 'Photo availability loading';
	else if (!profile.bullpen && mediaStatus === 'unavailable') photoSource = 'Photo source unavailable';
	let photoCaption = 'No verified photo published';
	if (profile.bullpen) photoCaption = 'Team-season pool · no photo';
	else if (cardPhoto) photoCaption = `Photo ${cardPhoto.year} · ${cardPhoto.selectedSeason ? 'Selected season' : 'Career photo'}`;
	else if (mediaStatus === 'loading') photoCaption = 'Photo availability loading';
	else if (mediaStatus === 'unavailable') photoCaption = 'Photo source unavailable';
	const backWar = role === 'bullpen' ? '' : warText(hasBatting, hasPitching, ranking);
	const front: CardFront = {
		era: eraForYear(profile.year), cardRole: role, given: name.given, family: name.family, full: fullName,
		team, nick: nickname, abbr: profile.teamId || initials(team), year: count(profile.year), pos,
		st1: frontStats[0], st2: frontStats[1], st3: frontStats[2],
		photo: cardPhoto?.url ?? '', selectedPhoto: cardPhoto, hasPhoto: !!cardPhoto, noPhoto: !cardPhoto,
		photoNote: profile.bullpen ? 'Team-season bullpen' : mediaStatus === 'loading' ? 'Photo loading' : mediaStatus === 'unavailable' ? 'Photo source unavailable' : 'No verified photo',
		caption: photoCaption,
		logo: cardLogo?.url ?? '', selectedLogo: cardLogo, hasLogo: !!cardLogo, noLogo: !cardLogo,
		logoLabel,
		k: roles({ primary: media?.teams[profile.franchiseId]?.color || STOCK, secondary: STOCK }),
		fin: materialFor(finishFor(finishRole(profile, slot, role), ranking?.battingWAR162, ranking?.pitchingWAR162)),
		mediaStatus
	};
	const supplemental: Supplemental = profile.bullpen ? {
		title: `${team} bullpen, ${front.year}`,
		sections: [
			{ h: 'Bullpen pool', rows: [
				{ k: 'Team-season', v: `${team}, ${front.year}` }, { k: `Members (${profile.bullpen.members.length})`, v: profile.bullpen.members.map(member => member.displayName).join(', ') || EM_DASH },
				{ k: 'Excluded saves leader', v: profile.bullpen.excluded.displayName || EM_DASH },
				{ k: 'Exclusion rule', v: 'The saves leader is excluded within the exact team-season; ties break by pitching outs, then season ID. The pool is fixed independently of the drafted closer.' },
				{ k: 'Source limitation', v: 'Source records do not split every starter and relief appearance, so this is a pool of relief-dominant pitcher-seasons, not reconstructed relief-only innings. Throwing handedness is neutral and support workload is unlimited.' },
				{ k: 'WAR', v: 'No composite WAR or individual WAR applies to this team unit.' },
				{ k: 'Portrait', v: 'No individual portrait is used for this historical team unit.' }
			] },
			{ h: 'Model notes', rows: [
				...modelContext,
				{ k: 'Workload', v: estimates.join(' ') || 'No bullpen-specific estimate is flagged.' },
				...(manifest?.approximations ?? []).map((v, index) => ({ k: `Shared note ${index + 1}`, v }))
			] },
			logoRows(cardLogo, mediaStatus),
			statisticsSource
		]
	} : {
		title: `${front.full}, ${team} ${front.year}`,
		sections: [
			{ h: 'Ranking', rows: [
				{ k: 'WAR/162', v: [hasBatting ? `batting ${decimal(ranking?.battingWAR162, 3)}` : '', hasPitching ? `pitching ${decimal(ranking?.pitchingWAR162, 3)}` : ''].filter(Boolean).join(' · ') || EM_DASH },
				{ k: 'Role', v: 'WAR/162 ranks draft choices and determines the cosmetic card finish. It is not a simulation input.' },
				{ k: 'Source', v: rankings?.source.description || 'Ranking source unavailable', href: rankings?.source.url }
			] },
			{ h: 'Model notes', rows: [
				...modelContext,
				{ k: 'Position appearances', v: 'Appearances establish historical qualification. They are not defensive-range ratings.' },
				...(estimates.length ? estimates.map((v, index) => ({ k: `Estimated input ${index + 1}`, v })) : [
					{ k: 'Estimates', v: 'No missing-data estimates are flagged for these roles. Shared simulation assumptions still apply.' }
				]),
				...(manifest?.approximations ?? []).map((v, index) => ({ k: `Shared note ${index + 1}`, v }))
			] },
			photoRows(cardPhoto, profile.year, media?.modifications, mediaStatus),
			logoRows(cardLogo, mediaStatus),
			statisticsSource
		]
	};
	const back: CardBack = {
		dia: positions(profile, hasPitching || !!profile.bullpen), showDia: !profile.bullpen && families.length === 1, posCode: pos,
		name: front.full, given: front.given, family: front.family, team, seasonLine: [front.year, profile.league, pos].filter(Boolean).join(' · '),
		playerLine: profile.bullpen ? `Relief pool · ${profile.bullpen.members.length} pitchers` : `Bats ${HAND[profile.bats] ?? EM_DASH} · Throws ${HAND[profile.throws] ?? EM_DASH} · ${count(profile.teamGames)} G sched.`,
		fams: families, sz: families.length > 1 ? TWO_SIZE : SINGLE_SIZE, cols: families.length > 1 ? 5 : 4,
		hasApps: !profile.bullpen, appsText: families.length !== 1, appsLabel: 'Games at', apps: apps(profile, hasPitching),
		hasWar: !!backWar, war: backWar, isBullpen: !!profile.bullpen,
		pool: profile.bullpen ? 'Excludes saves leader · members listed in details' : '', srcStats: statSource,
		srcPhoto: photoSource, srcCue: 'Details ›'
	};
	return { ...front, b: back, details: supplemental };
}
