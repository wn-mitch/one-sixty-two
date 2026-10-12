import { json, parseJson, type Db } from '../storage/sql.ts';
import { replayRun, RunActionError, unsupportedVersion, type DraftRun, type RunAction, type RunPhase, type RunSetup } from './run.ts';
import type { DraftCard } from './types.ts';

/** A Draft Mode run as the device keeps it: the setup and the player's actions so far. */
export interface SavedRun {
 id: string;
 createdAt: string;
 updatedAt: string;
 setup: RunSetup;
 actions: RunAction[];
 phase: RunPhase;
}

interface RunRow { [key: string]: string; id: string; created_at: string; updated_at: string; setup_json: string; actions_json: string; phase: string }

const isSetup = (value: unknown): value is RunSetup => {
 const setup = value as RunSetup | null;
 return typeof setup === 'object' && setup !== null
  && ['runVersion', 'rulesVersion', 'salaryVersion', 'dataVersion', 'franchiseId'].every(key => typeof setup[key as keyof RunSetup] === 'string')
  && Number.isInteger(setup.seed) && setup.seed >= 0 && setup.seed <= 0xffffffff;
};
const isAction = (value: unknown): value is RunAction =>
 typeof value === 'object' && value !== null && (value as RunAction).type === 'pick' && typeof (value as RunAction).cardId === 'string';

/** Parses a stored row; a row that fails the structural check is null, never repaired. */
function fromRow(row: RunRow): SavedRun | null {
 const setup = parseJson<unknown>(row.setup_json);
 const actions = parseJson<unknown>(row.actions_json);
 if (!isSetup(setup) || !Array.isArray(actions) || !actions.every(isAction)) return null;
 if (row.phase !== 'drafting' && row.phase !== 'window') return null;
 return { id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, setup, actions, phase: row.phase };
}

/** Writes the run after an action. Returns a notice when storage refuses it; the run itself continues. */
export async function saveRun(db: Db, id: string, run: DraftRun, now = new Date()): Promise<string | null> {
 const stamp = now.toISOString();
 try {
  await db.run([{
   sql: `INSERT INTO draft_runs (id, created_at, updated_at, setup_json, actions_json, phase) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at, actions_json = excluded.actions_json, phase = excluded.phase`,
   bind: [id, stamp, stamp, json(run.setup), json(run.actions), run.phase]
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

export type Resumed = { ok: true; run: DraftRun } | { ok: false; reason: string };

/**
 * Rebuilds a saved run under the current build. A run saved with other rules, salaries, data or
 * run format is refused with the reason rather than reinterpreted; so is a log that no longer replays.
 */
export function resumeRun(saved: SavedRun, cards: readonly DraftCard[], franchiseIds: readonly string[], dataVersion: string): Resumed {
 const stale = unsupportedVersion(saved.setup, dataVersion);
 if (stale) return { ok: false, reason: `This draft was saved with ${stale} that this version of the game no longer uses. Start a new draft.` };
 try {
  return { ok: true, run: replayRun(saved.setup, saved.actions, cards, franchiseIds) };
 } catch (error) {
  if (error instanceof RunActionError) return { ok: false, reason: 'This saved draft no longer replays. Start a new draft.' };
  throw error;
 }
}
