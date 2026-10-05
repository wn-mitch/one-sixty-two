import { validateDraft } from './draft.ts';
import type { Draft, Manifest } from './types.ts';

export const STORAGE_KEY = '162-zero:v1';
export type SavedPhase = 'draft' | 'lineup' | 'simulating' | 'results';
export interface SavedDraft extends Draft { phase: SavedPhase; latestResult?: unknown }
export interface StorageAccess { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export type Restore = { kind: 'empty' } | { kind: 'valid'; draft: Draft; phase: SavedPhase } | { kind: 'incompatible'; message: string } | { kind: 'unavailable'; message: string };
export function restoreDraft(storage: StorageAccess, manifest: Manifest): Restore {
 let bytes: string | null;
 try { bytes = storage.getItem(STORAGE_KEY); }
 catch { return { kind: 'unavailable', message: 'Resume unavailable: browser storage is blocked. You can still play.' }; }
 if (bytes === null) return { kind: 'empty' };
 try {
  const saved = JSON.parse(bytes) as SavedDraft;
  const draft = validateDraft(saved, manifest);
  if (!['draft', 'lineup', 'simulating', 'results'].includes(saved.phase) || saved.phase !== 'draft' && draft.picks.length !== 13 || saved.phase === 'draft' && draft.picks.length === 13) throw new Error('Invalid saved phase');
  return { kind: 'valid', draft, phase: saved.phase };
 } catch { return { kind: 'incompatible', message: 'Saved draft is incompatible. Start a new draft to replace it.' }; }
}
export function persistDraft(storage: StorageAccess, draft: Draft, phase: SavedPhase, latestResult?: unknown): string | null {
 try { storage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, phase, latestResult } satisfies SavedDraft)); return null; }
 catch { return 'Resume unavailable: browser storage is blocked. You can still play.'; }
}
