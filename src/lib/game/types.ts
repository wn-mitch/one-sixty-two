export const HITTER_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const;
export const STARTER_SLOTS = ['SP1', 'SP2', 'SP3'] as const;
export const LEGACY_SLOTS = [...HITTER_SLOTS, ...STARTER_SLOTS, 'CL'] as const;
export const SLOTS = [...LEGACY_SLOTS, 'BP'] as const;
export type Slot = typeof SLOTS[number];
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
export interface FieldingCounts { PO: number; A: number; E: number; SB: number; CS: number; InnOuts: number }
export interface Profile {
 seasonId: string; playerId: string; displayName: string; franchiseId: string; teamId: string;
 year: number; league: string; historicalTeam: string; teamGames: number; bats: string; throws: string;
 eligibleSlots: Slot[]; appearances: Partial<Record<Position, number>>;
 batting?: BattingCounts; pitching?: PitchingCounts;
 battingRates?: Rates; pitchingRates?: Rates;
 fielding: Partial<Record<Position, FieldingCounts>>;
 errorRates: Record<Position, number>; catcherCS: number;
 speed: number; stealAttempt: number; stealSuccess: number; doublePlay: number;
 estimatedFields: string[];
 bullpen?: {
  members: { seasonId: string; playerId: string; displayName: string }[];
  excluded: { seasonId: string; playerId: string; displayName: string };
 };
}
export interface Candidate { seasonId: string; playerId: string; franchiseId: string; decade: number; eligibleSlots: Slot[] }
export interface Franchise { id: string; name: string; decades: number[] }
export interface Attribution { title: string; credit: string; sourceUrl: string; license: string; licenseUrl: string; sourceCommit: string; changes: string; fullNotice: string }
export interface Manifest {
 schemaVersion: 1; dataVersion: string; sourceCommit: string; franchises: Franchise[];
 candidates: Candidate[]; chunks: Record<string, string>; simulationUrl: string;
 attributionUrl: string; archiveUrl: string; attribution: Attribution; approximations: string[];
 coverage: { decade: number; firstYear: number; lastYear: number; label: string }[];
 diagnostics: { excludedBatting: number; excludedPitching: number; excludedProfiles: number; estimatedProfiles: number; reportUrl: string };
}
export interface Opponent { id: string; name: string; park: number; hitters: Profile[]; starters: Profile[]; closer: Profile; bullpen: Profile }
export interface SimulationData {
 schemaVersion: 1; dataVersion: string; leagueRates: Rates; bullpen: Profile;
 opponents: Opponent[]; observedRuns: number;
 leagueErrorRates: Record<Position, number>; leagueStealAttempt: number; leagueStealSuccess: number; leagueCatcherCS: number; leagueDoublePlay: number;
}
export interface Roll { franchiseId: string; decade: number }
export interface Pick extends Roll { seasonId: string; slot: Slot }
export type ReplaySchemaVersion = 1 | 2 | 3;
/** The version written by new drafts. */
export const CURRENT_REPLAY_SCHEMA_VERSION = 3 as const;
/** Every version this build can still read, simulate, and verify. */
export const SUPPORTED_REPLAY_SCHEMA_VERSIONS: readonly ReplaySchemaVersion[] = [1, 2, 3];
export type DraftAction =
 | { type: 'roll' }
 | { type: 'pick'; seasonId: string; slot: Slot }
 | { type: 'reassign'; seasonId: string; slot: HitterSlot };
interface ReplaySnapshot {
 dataVersion: string; modelVersion: string; seed: number;
 picks: Pick[]; battingOrder: string[]; starterOrder: string[];
}
export type Replay =
 | (ReplaySnapshot & { schemaVersion: 1 | 2; actions?: never })
 | (ReplaySnapshot & { schemaVersion: 3; actions: DraftAction[] });
export type Draft = Replay & { currentRoll: Roll | null };
export const MODEL_VERSION = 'pa-v2';
export const compareId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
