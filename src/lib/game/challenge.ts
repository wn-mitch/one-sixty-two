import { seriesHash } from './replay-link.ts';

/**
 * A challenge is a friend's published season that the next draft started from its challenge card
 * is measured against. It is kept per browser and binds to that draft's seed, so the offer to play
 * the best-of-five appears only on the season drafted for it.
 */
export interface Challenge {
 replayId: string;
 wins: number;
 losses: number;
 /** Seed of the draft that answers the challenge; unset until that draft is created. */
 seed: number | null;
}

const STORAGE_KEY = '162-zero:challenge:v1';
const REPLAY_ID = /^[A-Za-z0-9_-]{22}$/;

/** Browsers can block storage by throwing on access, so the default is resolved where failures are caught. */
function browserStorage(): Storage | undefined {
 return globalThis.localStorage;
}

function parse(value: unknown): Challenge | null {
 if (!value || typeof value !== 'object') return null;
 const { replayId, wins, losses, seed } = value as Record<string, unknown>;
 if (typeof replayId !== 'string' || !REPLAY_ID.test(replayId)) return null;
 if (!Number.isInteger(wins) || !Number.isInteger(losses)) return null;
 if (seed !== null && !Number.isInteger(seed)) return null;
 return { replayId, wins: wins as number, losses: losses as number, seed: seed as number | null };
}

export function loadChallenge(storage?: Storage): Challenge | null {
 try { return parse(JSON.parse((storage ?? browserStorage())?.getItem(STORAGE_KEY) ?? 'null')); }
 catch { return null; }
}

/** Records a challenge accepted from its card; the next new draft claims it. */
export function acceptChallenge(challenge: Omit<Challenge, 'seed'>, storage?: Storage): boolean {
 try {
  const target = storage ?? browserStorage();
  target?.setItem(STORAGE_KEY, JSON.stringify({ ...challenge, seed: null }));
  return !!target;
 }
 catch { return false; }
}

/** Binds an unclaimed challenge to a newly created draft. */
export function claimChallenge(seed: number, storage?: Storage): void {
 const challenge = loadChallenge(storage);
 if (!challenge || challenge.seed !== null) return;
 try { (storage ?? browserStorage())?.setItem(STORAGE_KEY, JSON.stringify({ ...challenge, seed })); }
 catch { /* the offer is a convenience; the draft proceeds without it */ }
}

/** The challenge answered by the draft with this seed, if any. */
export function challengeFor(seed: number, storage?: Storage): Challenge | null {
 const challenge = loadChallenge(storage);
 return challenge?.seed === seed ? challenge : null;
}

/** `/h2h` prefilled with the answering club as Team A and the challenger as Team B; it plays on arrival. */
export function challengeSeriesPath(ownToken: string, challenge: Challenge): string {
 return `/h2h${seriesHash({
  'team-a': { link: `/#replay=${ownToken}`, name: 'Your club' },
  'team-b': { link: `/r/${challenge.replayId}`, name: `${challenge.wins}–${challenge.losses} challenger` }
 })}`;
}
