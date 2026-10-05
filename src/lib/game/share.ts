import { replayInput, validateReplay } from './draft.ts';
import type { Draft, Manifest } from './types.ts';

const MAX_BYTES = 16 * 1024;
const MAX_TOKEN_LENGTH = Math.ceil(MAX_BYTES * 4 / 3);
const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/**
 * Decode the original fragment format. New links use /r/<id>; this remains
 * solely for completed historical links that already contain a replay token.
 */
export function decodeReplay(token: string, manifest: Manifest): Draft {
 if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length > MAX_TOKEN_LENGTH) throw new Error('Invalid replay link');
 try {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(token.length / 4) * 4, '=');
  const binary = atob(padded);
  if (binary.length > MAX_BYTES) throw new Error('Replay exceeds the size limit');
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  return validateReplay(value, manifest);
 } catch (error) {
  if (error instanceof Error && (error.message === 'Saved draft is incompatible' || error.message.includes('incompatible'))) throw new Error('Replay version is incompatible');
  if (error instanceof Error && error.message === 'Replay exceeds the size limit') throw error;
  throw new Error('Invalid replay link: its draft or lineup could not be verified');
 }
}

/**
 * Upload the minimal replay input and return its durable opaque URL.
 * The server validates the replay against its authoritative manifest.
 */
export async function shareUrl(draft: Draft, origin: string): Promise<string> {
 const input = replayInput(draft);
 const bytes = new TextEncoder().encode(JSON.stringify(input));
 if (bytes.length > MAX_BYTES) throw new Error('Replay exceeds the size limit');
 let response: Response;
 try {
  response = await fetch(`${origin}/api/replays`, {
   method: 'POST',
   headers: { 'content-type': 'application/json' },
   body: JSON.stringify(input)
  });
 } catch {
  throw new Error('Replay storage is unavailable. Please retry.');
 }
 let payload: unknown = null;
 try { payload = await response.json(); } catch { /* use status-specific fallback below */ }
 if (!response.ok) {
  const message = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
   ? payload.message
   : response.status === 413 ? 'Replay is too large.' : response.status === 409 ? 'Replay is incompatible with this dataset.' : 'Replay storage is unavailable. Please retry.';
  throw new Error(message);
 }
 const id = payload && typeof payload === 'object' && 'id' in payload && typeof payload.id === 'string' ? payload.id : '';
 if (!ID_PATTERN.test(id)) throw new Error('Replay storage returned an invalid link. Please retry.');
 const link = `${origin}/r/${id}`;
 if (link.length > 100) throw new Error('Replay link is too long for this deployment. Please retry.');
 return link;
}
