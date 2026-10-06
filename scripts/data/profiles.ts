import { compareId, POSITIONS, type Franchise, type Position, type Profile, type Slot } from '../../src/lib/game/types.ts';
import { battingEvents, pitchingEvents, prepareRates } from '../../src/lib/sim/rates.ts';
import { buildBaselines, type Baselines } from './baselines.ts';
import { inEra, leagueKey, numberField, teamKey, type Row, type Tables } from './counts.ts';
import { applyFielding, buildFielding, type FieldingData } from './fielding.ts';

export interface CompiledProfiles {
 profiles: Profile[]; candidates: Profile[]; franchises: Franchise[]; currentTeams: Row[];
 baselines: Baselines; fielding: FieldingData; diagnostics: string[];
}
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

export function compileProfiles(tables: Tables): CompiledProfiles {
 const currentTeams = tables.Teams.filter(row => row.yearID === '2025' && (row.lgID === 'AL' || row.lgID === 'NL')).sort((a, b) => compareId(a.franchID, b.franchID));
 if (currentTeams.length !== 30 || new Set(currentTeams.map(row => row.franchID)).size !== 30) throw new Error('Expected thirty distinct current franchises');
 const current = new Set(currentTeams.map(row => row.franchID));
 const franchiseHistory = new Set(tables.TeamsFranchises.map(row => row.franchID));
 const teams = new Map<string, Row>();
 for (const row of tables.Teams.filter(inEra)) {
  if (teams.has(teamKey(row))) throw new Error(`Duplicate team key: ${teamKey(row)}`);
  if (!franchiseHistory.has(row.franchID)) throw new Error(`Unknown franchise mapping: ${teamKey(row)}`);
  teams.set(teamKey(row), row);
 }
 for (const table of ['Batting', 'Pitching', 'Fielding', 'FieldingOFsplit', 'Appearances']) {
  for (const row of tables[table]) {
   if (inEra(row) && !teams.has(teamKey(row))) throw new Error(`Missing ${table} team mapping: ${row.playerID}:${teamKey(row)}`);
  }
 }
 const baselines = buildBaselines(tables);
 const fielding = buildFielding(tables);
 const diagnostics = baselines.diagnostics;
 const people = new Map(tables.People.map(row => [row.playerID, row]));
 const profiles: Profile[] = [];
 const ids = [...new Set([...baselines.batters.keys(), ...baselines.pitchers.keys()])].sort(compareId);
 for (const id of ids) {
  const batter = baselines.batters.get(id);
  const pitcher = baselines.pitchers.get(id);
  const row = (batter ?? pitcher)!.group.row;
  const team = teams.get(teamKey(row))!;
  if (!current.has(team.franchID)) continue;
  const person = people.get(row.playerID);
  if (!person?.nameFirst || !person.nameLast) { diagnostics.push(`${id}: profile excluded: missing display identity`); continue; }
  const teamGames = numberField(team, 'G');
  if (!teamGames) { diagnostics.push(`${id}: profile excluded: invalid team games`); continue; }
  const league = baselines.leagues.get(leagueKey(row))!;
  const profile: Profile = {
   seasonId: id, playerId: row.playerID, displayName: `${person.nameFirst} ${person.nameLast}`, franchiseId: team.franchID,
   teamId: row.teamID, year: Number(row.yearID), league: row.lgID, historicalTeam: team.name, teamGames,
   bats: ['L', 'R', 'B'].includes(person.bats) ? person.bats : '', throws: ['L', 'R'].includes(person.throws) ? person.throws : '',
   eligibleSlots: [], appearances: {}, fielding: {}, errorRates: {} as Record<Position, number>, catcherCS: 0,
   speed: 0.5, stealAttempt: clamp(league.stealAttempt, 0, 0.25), stealSuccess: league.stealSuccess, doublePlay: league.doublePlay, estimatedFields: []
  };
  if (!profile.bats) profile.estimatedFields.push('bats.neutral');
  if (!profile.throws) profile.estimatedFields.push('throws.neutral');
  applyFielding(profile, fielding);
  if (batter) {
   profile.batting = { ...batter.counts };
   const park = parkFactor(team, 'BPF', profile);
   profile.battingRates = prepareRates(battingEvents(batter.counts), league.batting, baselines.target, park);
   const missing = batter.group.missing;
   if (missing.has('SF')) profile.estimatedFields.push('batting.SF.estimated');
   if (missing.has('SB') || missing.has('CS')) {
    profile.estimatedFields.push('baserunning.league');
    const opportunities = batter.counts.H + batter.counts.BB + batter.counts.HBP;
    profile.batting.SB = opportunities * league.stealAttempt * league.stealSuccess;
    profile.batting.CS = opportunities * league.stealAttempt * (1 - league.stealSuccess);
   } else {
    profile.stealAttempt = clamp((batter.counts.SB + batter.counts.CS) / Math.max(1, batter.counts.H + batter.counts.BB + batter.counts.HBP), 0, 0.25);
    profile.stealSuccess = (batter.counts.SB + 10 * league.stealSuccess) / (batter.counts.SB + batter.counts.CS + 10);
   }
   if (missing.has('GIDP')) profile.estimatedFields.push('doublePlay.league');
   else {
    const outs = battingEvents(batter.counts)[7];
    profile.doublePlay = outs > 0 ? clamp(4 * batter.counts.GIDP / outs, 0, 0.4) : 0;
   }
   if (batter.counts.PA >= 200) {
    profile.eligibleSlots = POSITIONS.filter(position => (profile.appearances[position] ?? 0) >= 10);
    profile.eligibleSlots.push('DH');
   }
  }
  if (pitcher) {
   profile.pitching = { ...pitcher.counts };
   profile.pitchingRates = prepareRates(pitchingEvents(pitcher.counts, league.hitShares), league.pitching, baselines.target, parkFactor(team, 'PPF', profile));
   profile.estimatedFields.push('pitching.allowedExtraBaseHits.league');
   for (const field of pitcher.group.missing) profile.estimatedFields.push(`pitching.${field}.estimated`);
   const counts = pitcher.counts;
   if (counts.GS >= 10 && counts.IPouts >= 180 && counts.GS / counts.G >= 0.6) profile.eligibleSlots.push('SP1', 'SP2', 'SP3');
   if (counts.IPouts >= 60 && counts.G > 0 && counts.GS / counts.G <= 0.2) profile.eligibleSlots.push('CL');
  }
  profiles.push(profile);
 }
 const speedPopulation = profiles.filter(profile => profile.batting && profile.batting.PA >= 200).map(profile => (profile.batting!.SB + profile.batting!.CS) / Math.max(1, profile.batting!.H + profile.batting!.BB + profile.batting!.HBP)).sort((a, b) => a - b);
 for (const profile of profiles) {
  if (!profile.batting || profile.estimatedFields.includes('baserunning.league')) { profile.estimatedFields.push('speed.league'); continue; }
  const count = profile.batting;
  profile.speed = percentile(speedPopulation, (count.SB + count.CS) / Math.max(1, count.H + count.BB + count.HBP));
 }
 const candidates = profiles.filter(profile => profile.eligibleSlots.length > 0);
 const franchises = currentTeams.map(team => ({ id: team.franchID, name: team.name, decades: [...new Set(candidates.filter(profile => profile.franchiseId === team.franchID).map(profile => Math.floor(profile.year / 10) * 10))].sort((a, b) => a - b) }));
 return { profiles, candidates, franchises, currentTeams, baselines, fielding, diagnostics };
}

function parkFactor(team: Row, column: string, profile: Profile): number {
 const raw = team[column];
 if (!raw?.trim()) { profile.estimatedFields.push(`${column}.neutral`); return 1; }
 const value = Number(raw);
 if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${column}: ${teamKey(team)}`);
 return value / 100;
}

export function percentile(sorted: number[], value: number): number {
 if (!sorted.length) throw new Error('Empty speed population');
 let low = 0, high = sorted.length;
 while (low < high) { const mid = (low + high) >>> 1; if (sorted[mid] < value) low = mid + 1; else high = mid; }
 const first = low;
 high = sorted.length;
 while (low < high) { const mid = (low + high) >>> 1; if (sorted[mid] <= value) low = mid + 1; else high = mid; }
 return clamp((first + low - 1) / (2 * Math.max(1, sorted.length - 1)), 0, 1);
}

export function opponentSlots(profile: Profile): Slot[] {
 return profile.batting && profile.batting.PA > 0 ? [...POSITIONS.filter(position => (profile.appearances[position] ?? 0) >= 1), 'DH'] : [];
}
