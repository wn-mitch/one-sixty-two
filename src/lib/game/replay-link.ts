import { validateReplay } from './draft.ts';
import { decodeReplay } from './share.ts';
import type { Draft, Manifest } from './types.ts';
import type { SeriesTeamId } from '../sim/series-types.ts';

export type ReplayLink = { kind: 'stored'; id: string } | { kind: 'inline'; token: string };

const STORED_ID = /^[A-Za-z0-9_-]{22}$/;

/** A user-facing link problem; `message` is safe to show beside the field. */
export class ReplayLinkError extends Error {
 readonly incompatible: boolean;
 constructor(message: string, incompatible = false) {
  super(message);
  this.name = 'ReplayLinkError';
  this.incompatible = incompatible;
 }
}

/**
 * Accepts same-origin `/r/{id}` links (absolute or relative) and `#replay={token}` links.
 * Foreign origins, credentials, queries, and malformed ids are rejected before any fetch.
 */
export function parseReplayLink(value: string, origin: string): ReplayLink {
 const trimmed = value.trim();
 if (!trimmed) throw new ReplayLinkError('Paste a replay link.');
 let url: URL;
 try { url = new URL(trimmed, origin); }
 catch { throw new ReplayLinkError('That is not a replay link.'); }
 const base = new URL(origin);
 if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.origin !== base.origin) throw new ReplayLinkError('Replay links must come from this site.');
 if (url.username || url.password || url.search) throw new ReplayLinkError('That is not a replay link.');
 const stored = url.pathname.match(/^\/r\/([^/]+)$/);
 if (stored) {
  if (url.hash || !STORED_ID.test(stored[1])) throw new ReplayLinkError('That replay link is malformed.');
  return { kind: 'stored', id: stored[1] };
 }
 if (url.hash.startsWith('#replay=') && (url.pathname === '/' || url.pathname === '')) {
  const token = url.hash.slice('#replay='.length);
  if (!token) throw new ReplayLinkError('That replay link is malformed.');
  return { kind: 'inline', token };
 }
 throw new ReplayLinkError('That is not a replay link.');
}

/** Loads and validates a replay link against the current manifest. Stored replays are fetched only from this site's API. */
export async function loadReplayLink(value: string, manifest: Manifest, origin: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<{ draft: Draft; link: ReplayLink }> {
 const link = parseReplayLink(value, origin);
 if (link.kind === 'inline') {
  try { return { draft: decodeReplay(link.token, manifest), link }; }
  catch (error) {
   const message = error instanceof Error ? error.message : 'Invalid replay link';
   throw new ReplayLinkError(message.includes('incompatible') ? 'That replay was made with an older version of the game.' : 'That replay link could not be verified.', message.includes('incompatible'));
  }
 }
 let response: Response;
 try { response = await fetcher(new URL(`/api/replays/${link.id}`, origin), { signal }); }
 catch (error) {
  if (signal?.aborted) throw error;
  throw new ReplayLinkError('The replay could not be loaded. Check your connection and retry.');
 }
 let payload: unknown = null;
 try { payload = await response.json(); } catch { /* the status decides the message */ }
 if (response.status === 404) throw new ReplayLinkError('No replay exists at that link.');
 if (response.status === 409) throw new ReplayLinkError('That replay was made with an older version of the game.', true);
 if (!response.ok) throw new ReplayLinkError('The replay could not be loaded. Please retry.');
 try { return { draft: validateReplay(payload, manifest), link }; }
 catch (error) {
  const incompatible = error instanceof Error && error.message.includes('incompatible');
  throw new ReplayLinkError(incompatible ? 'That replay was made with an older version of the game.' : 'That replay could not be verified.', incompatible);
 }
}

/** The shareable form of a link: `/r/{id}` or `/#replay={token}`, relative to the site. */
export function replayLinkPath(link: ReplayLink): string {
 return link.kind === 'stored' ? `/r/${link.id}` : `/#replay=${link.token}`;
}

export interface SeriesField { link: string; name: string }
const SERIES_TEAMS = ['team-a', 'team-b'] as const;
const HASH_KEYS = { 'team-a': ['a', 'an'], 'team-b': ['b', 'bn'] } as const;

/** Reads `#a=<link>&an=<name>&b=<link>&bn=<name>`; names are optional. */
export function parseSeriesHash(hash: string): Record<SeriesTeamId, SeriesField> | null {
 const params = new URLSearchParams(hash.replace(/^#/, ''));
 const fields = Object.fromEntries(SERIES_TEAMS.map(id => [id, { link: params.get(HASH_KEYS[id][0]) ?? '', name: params.get(HASH_KEYS[id][1]) ?? '' }])) as Record<SeriesTeamId, SeriesField>;
 return fields['team-a'].link || fields['team-b'].link ? fields : null;
}

export function seriesHash(fields: Record<SeriesTeamId, SeriesField>): string {
 const params = new URLSearchParams();
 for (const id of SERIES_TEAMS) {
  params.set(HASH_KEYS[id][0], fields[id].link);
  if (fields[id].name.trim()) params.set(HASH_KEYS[id][1], fields[id].name.trim());
 }
 return `#${params.toString()}`;
}
