import { describe, expect, it } from 'vitest';
import { acceptChallenge, challengeFor, challengeSeriesPath, claimChallenge } from './challenge.ts';
import { parseReplayLink, parseSeriesHash } from './replay-link.ts';

const ID = 'abcdefghijklmnopqrstuv';

function memoryStorage(): Storage {
 const items = new Map<string, string>();
 return {
  get length() { return items.size; },
  clear: () => items.clear(),
  getItem: key => items.get(key) ?? null,
  key: index => [...items.keys()][index] ?? null,
  removeItem: key => { items.delete(key); },
  setItem: (key, value) => { items.set(key, value); }
 };
}

describe('challenge binding', () => {
 it('binds to the first draft created after accepting and ignores later drafts', () => {
  const storage = memoryStorage();
  acceptChallenge({ replayId: ID, wins: 120, losses: 42 }, storage);
  expect(challengeFor(7, storage)).toBeNull();
  claimChallenge(7, storage);
  claimChallenge(8, storage);
  expect(challengeFor(7, storage)).toEqual({ replayId: ID, wins: 120, losses: 42, seed: 7 });
  expect(challengeFor(8, storage)).toBeNull();
 });

 it('accepting a new challenge replaces a claimed one', () => {
  const storage = memoryStorage();
  acceptChallenge({ replayId: ID, wins: 120, losses: 42 }, storage);
  claimChallenge(7, storage);
  acceptChallenge({ replayId: 'zyxwvutsrqponmlkjihgfe', wins: 99, losses: 63 }, storage);
  claimChallenge(9, storage);
  expect(challengeFor(7, storage)).toBeNull();
  expect(challengeFor(9, storage)?.wins).toBe(99);
 });

 it('ignores malformed stored challenges', () => {
  const storage = memoryStorage();
  storage.setItem('162-zero:challenge:v1', JSON.stringify({ replayId: 'short', wins: 1, losses: 1, seed: 7 }));
  expect(challengeFor(7, storage)).toBeNull();
 });

 it('builds a series link whose two teams parse as replay links', () => {
  const origin = 'https://play.example';
  const path = challengeSeriesPath('TOKEN', { replayId: ID, wins: 120, losses: 42, seed: 7 });
  const fields = parseSeriesHash(new URL(path, origin).hash)!;
  expect(parseReplayLink(fields['team-a'].link, origin)).toEqual({ kind: 'inline', token: 'TOKEN' });
  expect(parseReplayLink(fields['team-b'].link, origin)).toEqual({ kind: 'stored', id: ID });
  expect(fields['team-b'].name).toBe('120–42 challenger');
 });
});
