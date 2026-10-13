import type { ContactModel, ContactRecord } from '../sim/contact-profile.ts';
import type { ParkRef, StadiumConfig, StadiumSummary } from '../sim/park-types.ts';

export const HITTER_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const;
export const STARTER_SLOTS = ['SP1', 'SP2', 'SP3'] as const;
/** Named relievers in bullpen order; their relief roles, not the slot, decide when they pitch. */
export const RELIEF_SLOTS = ['RP1', 'RP2', 'RP3'] as const;
export const SLOTS = [...HITTER_SLOTS, ...STARTER_SLOTS, 'CL', ...RELIEF_SLOTS] as const;
export type Slot = typeof SLOTS[number];
/** The closer and named relievers, in the order a season request lists their roles. */
export const BULLPEN_SLOTS = ['CL', ...RELIEF_SLOTS] as const;
export type BullpenSlot = typeof BULLPEN_SLOTS[number];
/**
 * A named reliever's job (`ReliefRole` in the engine). The manager calls a role's primary holders
 * first, then secondary holders who sat out the previous game.
 */
export const RELIEF_ROLES = ['closer', 'setup', 'middle', 'long', 'stopper'] as const;
export type ReliefRole = typeof RELIEF_ROLES[number];
export interface ReliefAssignment<S extends string = BullpenSlot> { slot: S; primary: ReliefRole; secondary: ReliefRole | null }
/** Default roles by bullpen position, CL first (`default_roles` in the engine); Draft Mode's RP4 and RP5 use the last two. */
export const DEFAULT_RELIEF_ROLES: readonly (readonly [ReliefRole, ReliefRole])[] = [
 ['closer', 'setup'], ['setup', 'stopper'], ['setup', 'middle'], ['middle', 'long'], ['long', 'middle'], ['stopper', 'middle']
];
export const defaultReliefRoles = <S extends string>(slots: readonly S[]): ReliefAssignment<S>[] =>
 slots.map((slot, index) => ({ slot, primary: DEFAULT_RELIEF_ROLES[index][0], secondary: DEFAULT_RELIEF_ROLES[index][1] }));
/** A slot a card or saved season may carry. BP is the retired team-bullpen slot: collected bullpen cards and older saved seasons keep it, and no draft offers it. */
export type RosterSlot = Slot | 'BP';
export type Position = 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF';
export type HitterSlot = Position | 'DH';
export const MIN_SEASON_YEAR = 1950;
export const MAX_SEASON_YEAR = 2025;
export const POSITIONS: Position[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
export const EVENTS = ['BB', 'HBP', 'SO', '1B', '2B', '3B', 'HR', 'OUT'] as const;
export type Event = typeof EVENTS[number];
export type Rates = [number, number, number, number, number, number, number, number];
export interface BattingCounts { AB: number; H: number; doubles: number; triples: number; HR: number; BB: number; HBP: number; SO: number; SH: number; SF: number; SB: number; CS: number; GIDP: number; PA: number }
export interface PitchingCounts { G: number; GS: number; IPouts: number; H: number; HR: number; BB: number; HBP: number; SO: number; BFP: number; ER: number; SV: number }
export interface FieldingCounts { PO: number; A: number; E: number; DP: number; SB: number; CS: number; InnOuts: number }

export type DefensiveSkillName = 'hitPrevention' | 'doublePlay' | 'outfieldThrowing' | 'errorAvoidance' | 'catcherThrowing';
export interface DefensiveSkills {
 hitPrevention: number;
 doublePlay: number;
 outfieldThrowing: number;
 errorAvoidance: number;
 catcherThrowing: number;
}
export interface DefensiveEvidence {
 status: 'exact' | 'genericOutfield' | 'neutralMissingEvidence' | 'notApplicable';
 exposure: number;
 reason?: string;
}
export interface DefensivePosition extends DefensiveSkills {
 evidence: Record<DefensiveSkillName, DefensiveEvidence>;
 expectedRunsSaved162: number | null;
 residualClamped: boolean;
}
export interface Profile {
 seasonId: string; playerId: string; displayName: string; franchiseId: string; teamId: string;
 year: number; league: string; historicalTeam: string; teamGames: number; bats: string; throws: string;
 eligibleSlots: RosterSlot[]; primaryHitterSlot: HitterSlot | null; appearances: Partial<Record<HitterSlot, number>>;
 batting?: BattingCounts; pitching?: PitchingCounts;
 battingRates?: Rates; pitchingRates?: Rates;
 fielding: Partial<Record<Position, FieldingCounts>>;
 defense: { positions: Partial<Record<Position, DefensivePosition>> };
 speed: number; stealAttempt: number; stealSuccess: number; doublePlay: number;
 estimatedFields: string[];
 /** Estimated contact targets for the applicable roles; never measured batted-ball data. */
 contact?: ContactRecord;
 bullpen?: {
  members: { seasonId: string; playerId: string; displayName: string }[];
  excluded: { seasonId: string; playerId: string; displayName: string };
 };
 /** Modeled runs above replacement at the card's best slot (as priced in `draft-cards.json`); absent for collected team bullpens. */
 valueRuns?: number;
}
export interface Candidate { seasonId: string; playerId: string; franchiseId: string; decade: number; eligibleSlots: RosterSlot[] }
/** Every candidate but the collected team bullpens; Draft Mode prices and deals only these. */
export const draftableCandidates = <T extends { eligibleSlots: readonly RosterSlot[] }>(candidates: readonly T[]): T[] => candidates.filter(candidate => !candidate.eligibleSlots.includes('BP'));
export interface ShowcaseCard { profile: Profile; slot: Slot }
export interface Franchise { id: string; name: string; decades: number[] }
export interface Attribution { title: string; credit: string; sourceUrl: string; license: string; licenseUrl: string; sourceCommit: string; changes: string; fullNotice: string }
export interface Manifest {
 schemaVersion: 1; dataVersion: string; sourceCommit: string; franchises: Franchise[];
 candidates: Candidate[]; chunks: Record<string, string>; simulationUrl: string; showcaseUrl: string;
 attributionUrl: string; archiveUrl: string; attribution: Attribution; approximations: string[];
 coverage: { decade: number; firstYear: number; lastYear: number; label: string }[];
 diagnostics: { excludedBatting: number; excludedPitching: number; excludedProfiles: number; estimatedProfiles: number; reportUrl: string };
 /** The 2025 reference stadium deck, one per current franchise. */
 stadiums: StadiumSummary[];
 /** Elite draftable seasons jackpot packs deal from, sorted by season identity. */
 jackpot: string[];
}
/** A 2025 club: the closer, its next three relievers by relief outs as named relievers, and the rest of its relief pooled as the remainder arm. */
export interface Opponent { id: string; name: string; homeStadium: ParkRef; hitters: Profile[]; starters: Profile[]; closer: Profile; relievers: Profile[]; bullpen: Profile }
export interface DefensiveEnvironment {
 leagueRates: Rates;
 leagueErrorRates: Record<Position, number>;
 leagueStealAttempt: number;
 leagueStealSuccess: number;
 leagueDoublePlay: number;
 /** League 2025 Statcast shape and the neutral-park response basis. */
 contactModel: ContactModel;
}
export interface SimulationData extends DefensiveEnvironment {
 schemaVersion: 1; dataVersion: string; bullpen: Profile;
 opponents: Opponent[]; observedRuns: number;
 stadiums: StadiumConfig[];
 defenseMethodVersion: typeof DEFENSE_METHOD_VERSION;
 valuationVersion: typeof VALUATION_VERSION;
}
/** A franchise pack: every legal season the franchise had in one decade. */
export interface TeamRoll { franchiseId: string; decade: number }
/** A jackpot pack: a seeded handful of elite seasons (`Manifest.jackpot`) from any franchise and decade. */
export interface JackpotRoll { jackpot: string[] }
export type Roll = TeamRoll | JackpotRoll;
export const isJackpot = (roll: Roll): roll is JackpotRoll => 'jackpot' in roll;
/** The franchise and decade are the drafted season's own; `jackpot` marks a card taken from a jackpot pack. */
export interface Pick extends TeamRoll { seasonId: string; slot: Slot; jackpot?: true }
export const CURRENT_REPLAY_SCHEMA_VERSION = 8 as const;
export type ReplaySchemaVersion = typeof CURRENT_REPLAY_SCHEMA_VERSION;
export const MODEL_VERSION = 'contact-v2' as const;
export const RULES_VERSION = 'classic-v6' as const;
export const DEFENSE_METHOD_VERSION = 'defense-v2' as const;
export const VALUATION_VERSION = 'sim-war-v2' as const;
export type DraftAction =
 | { type: 'select-stadium'; stadiumId: string; stadiumVersion: string }
 | { type: 'roll' }
 | { type: 'add-pack' }
 | { type: 'choose-pack'; pack: number }
 | { type: 'pick'; seasonId: string; slot: Slot }
 | { type: 'reassign'; seasonId: string; slot: HitterSlot };
export interface Replay {
 schemaVersion: ReplaySchemaVersion;
 dataVersion: string;
 modelVersion: typeof MODEL_VERSION;
 rulesVersion: typeof RULES_VERSION;
 seed: number;
 /** Pinned before the first roll; null only while an unselected run is in progress. */
 homeStadium: ParkRef | null;
 picks: Pick[];
 battingOrder: string[];
 starterOrder: string[];
 /** Roles for CL and RP1-RP3 in bullpen order; empty until the roster is complete. */
 reliefRoles: ReliefAssignment[];
 actions: DraftAction[];
}
/**
 * `packs` are the franchise packs open on the table for the pending roll, in the order they were dealt.
 * With one pack it is `currentRoll`; with two or three, `currentRoll` is null until the player chooses one.
 */
export interface Draft extends Replay { currentRoll: Roll | null; packs: Roll[] }
/**
 * Roles for every slot of `slots` in order once the roster is complete, none before; a secondary
 * role may not repeat the primary.
 */
export function validateReliefRoles(value: unknown, complete: boolean, slots: readonly string[] = BULLPEN_SLOTS): ReliefAssignment[] {
 const isRole = (role: unknown) => (RELIEF_ROLES as readonly unknown[]).includes(role);
 const expected: readonly string[] = complete ? slots : [];
 if (!Array.isArray(value) || value.length !== expected.length) throw new Error('Invalid relief roles');
 return value.map((item, index) => {
  const assignment = item as Record<string, unknown>;
  if (!assignment || typeof assignment !== 'object' || Object.keys(assignment).length !== 3 || assignment.slot !== expected[index] ||
   !isRole(assignment.primary) || (assignment.secondary !== null && (!isRole(assignment.secondary) || assignment.secondary === assignment.primary))) {
   throw new Error('Invalid relief roles');
  }
  return { slot: expected[index], primary: assignment.primary, secondary: assignment.secondary } as ReliefAssignment;
 });
}

export const compareId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
