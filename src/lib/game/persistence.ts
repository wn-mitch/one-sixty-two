import { validateDraft } from './draft.ts';
import { draftRules } from './rules.ts';
import { libraryKey } from './library.ts';
import type { Draft, Manifest } from './types.ts';
import type { Db } from '../storage/sql.ts';

export type SavedPhase = 'stadium' | 'draft' | 'lineup' | 'simulating' | 'results';
export type SavedDraft = Draft & { phase: SavedPhase };
export type Restore = { kind: 'empty' } | { kind: 'valid'; draft: Draft; phase: SavedPhase; notice?: string } | { kind: 'incompatible'; message: string } | { kind: 'unavailable'; message: string };

export const RESUME_NOTICE = 'Resume unavailable: browser storage is blocked. You can still play.';

/** A saved snapshot that validates under the current rules, with a phase consistent with its draft. */
function parseSaved(json: string, manifest: Manifest): { draft: Draft; phase: SavedPhase } {
 const saved = JSON.parse(json) as SavedDraft;
 const draft = validateDraft(saved, manifest);
 const phase = saved.phase;
 const complete = draft.picks.length === draftRules(draft.schemaVersion).slots.length;
 if (!['stadium', 'draft', 'lineup', 'simulating', 'results'].includes(phase) ||
  (phase === 'stadium') !== !draft.homeStadium ||
  !['stadium', 'draft'].includes(phase) && !complete || phase === 'draft' && complete) throw new Error('Invalid saved phase');
 return { draft, phase };
}

/** The Classic draft in progress; a draft from another rules, model or data version is reported, not migrated. */
export async function restoreDraft(db: Db, manifest: Manifest): Promise<Restore> {
 let rows: { json: string }[];
 try { rows = await db.all<{ json: string }>('SELECT json FROM draft WHERE id = 1'); }
 catch { return { kind: 'unavailable', message: RESUME_NOTICE }; }
 if (!rows.length) return { kind: 'empty' };
 let draft: Draft;
 let phase: SavedPhase;
 try {
  ({ draft, phase } = parseSaved(rows[0].json, manifest));
  if (draft.daily !== undefined) throw new Error('A daily run is not a Classic draft');
 } catch {
  try {
   await db.run([{ sql: 'DELETE FROM draft WHERE id = 1 AND json = ?', bind: [rows[0].json] }]);
   return { kind: 'incompatible', message: 'An older draft could not resume. Your saved seasons and collection are unchanged.' };
  } catch {
   return { kind: 'unavailable', message: 'An older draft could not resume or be cleared because browser storage is unavailable. Your saved seasons and collection are unchanged.' };
  }
 }
 if (phase === 'results' || phase === 'simulating' || phase === 'lineup') {
  try {
   const stored = await db.all('SELECT key FROM seasons WHERE key = ?', [await libraryKey(draft)]);
   if (stored.length) {
    await db.run([{ sql: 'DELETE FROM draft WHERE id = 1 AND json = ?', bind: [rows[0].json] }]);
    return { kind: 'empty' };
   }
  } catch {
   // Keep recovery available if the history check or cleanup cannot finish.
   return { kind: 'valid', draft, phase, notice: 'Your saved season could not be checked. The draft is kept for recovery.' };
  }
 }
 return { kind: 'valid', draft, phase };
}

/** Saves a snapshot to its slot: the Classic draft, or its day's daily run. */
export async function persistDraft(db: Db, draft: Draft, phase: SavedPhase, now = new Date()): Promise<string | null> {
 try {
  const json = JSON.stringify({ ...draft, phase } satisfies SavedDraft);
  // A finished daily keeps its result; a late write from its own run never reopens it.
  if (draft.daily !== undefined) await db.run([{
   sql: `INSERT INTO daily_runs (date, started_at, updated_at, json) VALUES (?, ?, ?, ?)
    ON CONFLICT (date) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at WHERE daily_runs.season_key IS NULL`,
   bind: [draft.daily, now.toISOString(), now.toISOString(), json]
  }]);
  else await db.run([{
   sql: 'INSERT INTO draft (id, json, updated_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at',
   bind: [json, now.toISOString()]
  }]);
  return null;
 } catch { return RESUME_NOTICE; }
}

/** Clears only this completed roster's snapshots, including a phase whose final write failed. */
export async function clearCompletedDraft(db: Db, draft: Draft): Promise<string | null> {
 try {
  await db.run([{
   sql: 'DELETE FROM draft WHERE id = 1 AND json IN (?, ?, ?)',
   bind: (['lineup', 'simulating', 'results'] as const).map(phase => JSON.stringify({ ...draft, phase } satisfies SavedDraft))
  }]);
  return null;
 } catch {
  return 'Your season is in My teams, but its active draft could not be cleared. Browser storage is unavailable.';
 }
}

/**
 * One day's daily run on this device. Starting it spends the day's attempt: from then on it can only be
 * resumed, and once its season is saved only its result remains.
 */
export type DailyRun =
 | { kind: 'unplayed'; notice?: string }
 | { kind: 'active'; draft: Draft; phase: SavedPhase }
 | { kind: 'complete'; record: { wins: number; losses: number } }
 | { kind: 'unavailable'; message: string };

export const DAILY_STORAGE_NOTICE = 'The daily needs browser storage to keep its one attempt. Classic play still works.';

export async function restoreDaily(db: Db, manifest: Manifest, date: string): Promise<DailyRun> {
 let rows: { json: string | null; wins: number | null; losses: number | null }[];
 try { rows = await db.all('SELECT json, wins, losses FROM daily_runs WHERE date = ?', [date]); }
 catch { return { kind: 'unavailable', message: DAILY_STORAGE_NOTICE }; }
 const [row] = rows;
 if (!row) return { kind: 'unplayed' };
 if (row.wins !== null && row.losses !== null) return { kind: 'complete', record: { wins: row.wins, losses: row.losses } };
 try {
  const { draft, phase } = parseSaved(row.json!, manifest);
  if (draft.daily !== date) throw new Error('Saved daily is from another day');
  return { kind: 'active', draft, phase };
 } catch {
  // A game update between sessions changes the day's packs, so the run starts over rather than resume on another pool.
  try {
   await db.run([{ sql: 'DELETE FROM daily_runs WHERE date = ? AND season_key IS NULL AND json = ?', bind: [date, row.json] }]);
   return { kind: 'unplayed', notice: 'Today’s daily could not resume after a game update, so it starts over.' };
  } catch { return { kind: 'unavailable', message: DAILY_STORAGE_NOTICE }; }
 }
}
