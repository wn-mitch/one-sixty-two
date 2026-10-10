import { describe, expect, it } from 'vitest';
import { parseReplayLink, parseSeriesHash, ReplayLinkError, replayLinkPath, seriesHash } from './replay-link.ts';

const ORIGIN = 'https://162-0.example';
const ID = 'abcdefghijklmnopqrstuv';

describe('replay links', () => {
 it('accepts stored and inline links from this site, absolute or relative', () => {
  expect(parseReplayLink(`${ORIGIN}/r/${ID}`, ORIGIN)).toEqual({ kind: 'stored', id: ID });
  expect(parseReplayLink(`  /r/${ID} `, ORIGIN)).toEqual({ kind: 'stored', id: ID });
  expect(parseReplayLink(`${ORIGIN}/#replay=tok-en_1`, ORIGIN)).toEqual({ kind: 'inline', token: 'tok-en_1' });
 });
 it('rejects foreign origins, queries, credentials and malformed ids before any fetch', () => {
  for (const value of [`https://evil.example/r/${ID}`, `${ORIGIN}/r/${ID}?x=1`, `https://user:pw@162-0.example/r/${ID}`, `${ORIGIN}/r/short`, `${ORIGIN}/about`, `${ORIGIN}/#replay=`, '']) {
   expect(() => parseReplayLink(value, ORIGIN), value).toThrow(ReplayLinkError);
  }
 });
});

describe('series links', () => {
 it('round-trips two nested replay links and names through one hash', () => {
  const fields = {
   'team-a': { link: replayLinkPath({ kind: 'inline', token: 'a+b/c=&d' }), name: 'The Machine & Co' },
   'team-b': { link: `/r/${ID}`, name: '' }
  };
  const parsed = parseSeriesHash(seriesHash(fields))!;
  expect(parsed).toEqual(fields);
  expect(parseReplayLink(parsed['team-a'].link, ORIGIN)).toEqual({ kind: 'inline', token: 'a+b/c=&d' });
 });
 it('ignores hashes that name no team', () => {
  expect(parseSeriesHash('')).toBeNull();
  expect(parseSeriesHash('#replay=abc')).toBeNull();
 });
});
