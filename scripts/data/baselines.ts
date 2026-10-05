import type { BattingCounts, PitchingCounts, Rates } from '../../src/lib/game/types.ts';
import { battingEvents, normalize, pitchingEvents } from '../../src/lib/sim/rates.ts';
import { battingColumns, battingCounts, groupCounts, leagueKey, pitchingColumns, pitchingCounts, type Group, type Tables } from './counts.ts';

export interface League {
 batting: Rates; pitching: Rates; hitShares: [number, number, number];
 stealAttempt: number; stealSuccess: number; doublePlay: number;
}
export interface Baselines {
 leagues: Map<string, League>; target: Rates;
 batters: Map<string, { group: Group; counts: BattingCounts }>;
 pitchers: Map<string, { group: Group; counts: PitchingCounts }>;
 diagnostics: string[];
}
const zero = (): Rates => [0, 0, 0, 0, 0, 0, 0, 0];
const add = (a: Rates, b: Rates): void => { for (let i = 0; i < 8; i++) a[i] += b[i]; };

export function buildBaselines(tables: Tables): Baselines {
 const batters: Baselines['batters'] = new Map();
 const pitchers: Baselines['pitchers'] = new Map();
 const diagnostics: string[] = [];
 const totals = new Map<string, { events: Rates; sb: number; cs: number; onBase: number; gidp: number; outs: number }>();
 for (const [id, group] of groupCounts(tables.Batting, battingColumns)) {
  try {
   const counts = battingCounts(group);
   if (!counts.PA) continue;
   const events = battingEvents(counts);
   batters.set(id, { group, counts });
   const key = leagueKey(group.row);
   const total = totals.get(key) ?? { events: zero(), sb: 0, cs: 0, onBase: 0, gidp: 0, outs: 0 };
   add(total.events, events);
   if (!group.missing.has('SB') && !group.missing.has('CS')) {
    total.sb += counts.SB; total.cs += counts.CS;
    total.onBase += counts.H + counts.BB + counts.HBP;
   }
   if (!group.missing.has('GIDP')) { total.gidp += counts.GIDP; total.outs += events[7]; }
   totals.set(key, total);
  } catch (error) { diagnostics.push(`${id}: batting excluded: ${String(error)}`); }
 }
 const leagues = new Map<string, League>();
 const targetEvents = zero();
 for (const [key, total] of totals) {
  const batting = normalize(total.events);
  if (batting.some(value => value <= 0)) throw new Error(`Zero batting league event rate: ${key}`);
  const hits = total.events[3] + total.events[4] + total.events[5];
  leagues.set(key, { batting, pitching: zero(), hitShares: [total.events[3] / hits, total.events[4] / hits, total.events[5] / hits], stealAttempt: (total.sb + total.cs) / Math.max(1, total.onBase), stealSuccess: total.sb / Math.max(1, total.sb + total.cs), doublePlay: Math.min(0.4, 4 * total.gidp / Math.max(1, total.outs)) });
  if (key.startsWith('2025:')) add(targetEvents, total.events);
 }
 const pitchingTotals = new Map<string, Rates>();
 for (const [id, group] of groupCounts(tables.Pitching, pitchingColumns)) {
  try {
   const counts = pitchingCounts(group);
   if (!counts.IPouts && !counts.BFP) continue;
   const key = leagueKey(group.row);
   const league = leagues.get(key);
   if (!league) throw new Error(`Missing batting league: ${key}`);
   if (group.missing.has('HBP')) {
    counts.HBP = group.missing.has('BFP') ? counts.BFP * league.batting[1] / (1 - league.batting[1]) : counts.BFP * league.batting[1];
    if (group.missing.has('BFP')) counts.BFP += counts.HBP;
   }
   const events = pitchingEvents(counts, league.hitShares);
   pitchers.set(id, { group, counts });
   const total = pitchingTotals.get(key) ?? zero();
   add(total, events); pitchingTotals.set(key, total);
  } catch (error) { diagnostics.push(`${id}: pitching excluded: ${String(error)}`); }
 }
 for (const [key, league] of leagues) {
  const total = pitchingTotals.get(key);
  if (!total) throw new Error(`Missing pitching league: ${key}`);
  league.pitching = normalize(total);
  if (league.pitching.some(value => value <= 0)) throw new Error(`Zero pitching league event rate: ${key}`);
 }
 return { leagues, target: normalize(targetEvents), batters, pitchers, diagnostics };
}
