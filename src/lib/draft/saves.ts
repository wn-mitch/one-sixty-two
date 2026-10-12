import { json, parseJson, type Db } from '../storage/sql.ts';
import { STACK_ROLES } from './cleanup.ts';
import { LEAGUE_VERSION, LineupError, validateLineup, type LeagueSeason } from './league.ts';
import { replayRun, RunActionError, unsupportedVersion, type DraftRun, type RunAction, type RunData, type RunPhase, type RunSetup } from './run.ts';

/**
 * A Draft Mode run as the device keeps it: the setup and the player's actions so far, which replay
 * the draft and window, and once the league starts its season, kept as played results.
 */
export interface SavedRun {
 id: string;
 createdAt: string;
 updatedAt: string;
 setup: RunSetup;
 actions: RunAction[];
 phase: RunPhase;
 season: LeagueSeason | null;
}

interface RunRow { [key: string]: string | null; id: string; created_at: string; updated_at: string; setup_json: string; actions_json: string; phase: string; season_json: string | null }

const isSetup = (value: unknown): value is RunSetup => {
 const setup = value as RunSetup | null;
 return typeof setup === 'object' && setup !== null
  && ['runVersion', 'rulesVersion', 'salaryVersion', 'dataVersion', 'franchiseId'].every(key => typeof setup[key as keyof RunSetup] === 'string')
  && Number.isInteger(setup.seed) && setup.seed >= 0 && setup.seed <= 0xffffffff
  && typeof setup.difficulty === 'string';
};
const isIdList = (value: unknown): value is string[] => Array.isArray(value) && value.every(id => typeof id === 'string');
const isAction = (value: unknown): value is RunAction => {
 if (typeof value !== 'object' || value === null) return false;
 const action = value as Record<string, unknown>;
 switch (action.type) {
  case 'pick': case 'cut': return typeof action.cardId === 'string';
  case 'cleanup': return (STACK_ROLES as readonly unknown[]).includes(action.role);
  case 'autofix': return true;
  case 'submit': return typeof action.active === 'object' && action.active !== null && isIdList(Object.values(action.active)) && isIdList(action.reserves);
  default: return false;
 }
};
const isSeason = (value: unknown): value is LeagueSeason => {
 const season = value as LeagueSeason | null;
 return typeof season === 'object' && season !== null && Array.isArray(season.rivals) && Array.isArray(season.lineups) && Array.isArray(season.chapters) && typeof season.version === 'string';
};
const PHASES: readonly string[] = ['drafting', 'window', 'season'] satisfies RunPhase[];

/** Parses a stored row; a row that fails the structural check is null, never repaired. */
function fromRow(row: RunRow): SavedRun | null {
 const setup = parseJson<unknown>(row.setup_json);
 const actions = parseJson<unknown>(row.actions_json);
 const season = row.season_json === null ? null : parseJson<unknown>(row.season_json);
 if (!isSetup(setup) || !Array.isArray(actions) || !actions.every(isAction) || !PHASES.includes(row.phase)) return null;
 if (season !== null && !isSeason(season)) return null;
 return { id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, setup, actions, phase: row.phase as RunPhase, season };
}

/** Writes the run after an action. Returns a notice when storage refuses it; the run itself continues. */
export async function saveRun(db: Db, id: string, run: DraftRun, season: LeagueSeason | null = null, now = new Date()): Promise<string | null> {
 const stamp = now.toISOString();
 try {
  await db.run([{
   sql: `INSERT INTO draft_runs (id, created_at, updated_at, setup_json, actions_json, phase, season_json) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at, actions_json = excluded.actions_json, phase = excluded.phase, season_json = excluded.season_json`,
   bind: [id, stamp, stamp, json(run.setup), json(run.actions), run.phase, season === null ? null : json(season)]
  }]);
  return null;
 } catch { return 'Your draft could not be saved: browser storage is blocked or full. It continues in this tab.'; }
}

/** The most recently updated run that parses, or null. */
export async function latestRun(db: Db): Promise<SavedRun | null> {
 const rows = await db.all<RunRow>('SELECT * FROM draft_runs ORDER BY updated_at DESC, id');
 for (const row of rows) {
  const saved = fromRow(row);
  if (saved) return saved;
 }
 return null;
}

export async function deleteRun(db: Db, id: string): Promise<void> {
 await db.run([{ sql: 'DELETE FROM draft_runs WHERE id = ?', bind: [id] }]);
}

export type Resumed = { ok: true; run: DraftRun; season: LeagueSeason | null } | { ok: false; reason: string };

/**
 * Rebuilds a saved run under the current build. A run saved with other rules, salaries, data or
 * run format is refused with the reason rather than reinterpreted; so is a log that no longer replays.
 */
export function resumeRun(saved: SavedRun, data: RunData, dataVersion: string): Resumed {
 const stale = unsupportedVersion(saved.setup, dataVersion);
 if (stale) return { ok: false, reason: `This draft was saved with ${stale} that this version of the game no longer uses. Start a new draft.` };
 if (saved.season && saved.season.version !== LEAGUE_VERSION) return { ok: false, reason: 'This season was saved with league rules this version of the game no longer uses. Start a new draft.' };
 try {
  const run = replayRun(saved.setup, saved.actions, data);
  if (saved.season) {
   if (run.phase !== 'season' || saved.season.lineups.length !== run.seating.seats.length) throw new LineupError('Season does not match the run');
   saved.season.lineups.forEach((lineup, seat) => validateLineup(run, seat, lineup));
  }
  return { ok: true, run, season: saved.season };
 } catch (error) {
  if (error instanceof RunActionError || error instanceof LineupError) return { ok: false, reason: 'This saved draft no longer replays. Start a new draft.' };
  throw error;
 }
}
