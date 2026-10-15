import { validateDraft } from './draft.ts';
import { draftRules } from './rules.ts';
import { libraryKey } from './library.ts';
import type { Draft, Manifest } from './types.ts';
import type { Db } from '../storage/sql.ts';

export type SavedPhase = 'stadium' | 'draft' | 'lineup' | 'simulating' | 'results';
export type SavedDraft = Draft & { phase: SavedPhase };
export type Restore = { kind: 'empty' } | { kind: 'valid'; draft: Draft; phase: SavedPhase; notice?: string } | { kind: 'incompatible'; message: string } | { kind: 'unavailable'; message: string };

export const RESUME_NOTICE = 'Resume unavailable: browser storage is blocked. You can still play.';

/** The draft in progress; a draft from another rules, model or data version is reported, not migrated. */
export async function restoreDraft(db: Db, manifest: Manifest): Promise<Restore> {
 let rows: { json: string }[];
 try { rows = await db.all<{ json: string }>('SELECT json FROM draft WHERE id = 1'); }
 catch { return { kind: 'unavailable', message: RESUME_NOTICE }; }
 if (!rows.length) return { kind: 'empty' };
 let draft: Draft;
 let phase: SavedPhase;
 try {
  const saved = JSON.parse(rows[0].json) as SavedDraft;
  draft = validateDraft(saved, manifest);
  phase = saved.phase;
  const complete = draft.picks.length === draftRules(draft.schemaVersion).slots.length;
  if (!['stadium', 'draft', 'lineup', 'simulating', 'results'].includes(phase) ||
   (phase === 'stadium') !== !draft.homeStadium ||
   !['stadium', 'draft'].includes(phase) && !complete || phase === 'draft' && complete) throw new Error('Invalid saved phase');
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

export async function persistDraft(db: Db, draft: Draft, phase: SavedPhase, now = new Date()): Promise<string | null> {
 try {
  await db.run([{
   sql: 'INSERT INTO draft (id, json, updated_at) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at',
   bind: [JSON.stringify({ ...draft, phase } satisfies SavedDraft), now.toISOString()]
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
  return 'Your season is in My seasons, but its active draft could not be cleared. Browser storage is unavailable.';
 }
}
