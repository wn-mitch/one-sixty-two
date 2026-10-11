import { validateDraft } from './draft.ts';
import { draftRules } from './rules.ts';
import type { Draft, Manifest } from './types.ts';
import type { Db } from '../storage/sql.ts';

export type SavedPhase = 'stadium' | 'draft' | 'lineup' | 'simulating' | 'results';
export type SavedDraft = Draft & { phase: SavedPhase };
export type Restore = { kind: 'empty' } | { kind: 'valid'; draft: Draft; phase: SavedPhase } | { kind: 'incompatible'; message: string } | { kind: 'unavailable'; message: string };

export const RESUME_NOTICE = 'Resume unavailable: browser storage is blocked. You can still play.';

/** The draft in progress; a draft from another rules, model or data version is reported, not migrated. */
export async function restoreDraft(db: Db, manifest: Manifest): Promise<Restore> {
 let rows: { json: string }[];
 try { rows = await db.all<{ json: string }>('SELECT json FROM draft WHERE id = 1'); }
 catch { return { kind: 'unavailable', message: RESUME_NOTICE }; }
 if (!rows.length) return { kind: 'empty' };
 try {
  const saved = JSON.parse(rows[0].json) as SavedDraft;
  const draft = validateDraft(saved, manifest);
  const complete = draft.picks.length === draftRules(draft.schemaVersion).slots.length;
  if (!['stadium', 'draft', 'lineup', 'simulating', 'results'].includes(saved.phase) ||
   (saved.phase === 'stadium') !== !draft.homeStadium ||
   !['stadium', 'draft'].includes(saved.phase) && !complete || saved.phase === 'draft' && complete) throw new Error('Invalid saved phase');
  return { kind: 'valid', draft, phase: saved.phase };
 } catch { return { kind: 'incompatible', message: 'Saved draft is incompatible. Start a new draft to replace it.' }; }
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
