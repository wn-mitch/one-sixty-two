import { MODEL_VERSION, RULES_VERSION } from '../game/types.ts';
import type { BatterLine, GameResult, PitcherLine } from '../sim/types.ts';
import { LEAGUE_CHAPTERS, SEGMENTS_PER_CHAPTER } from '../sim/league-types.ts';
import { segmentDecree } from './decrees.ts';
import { headToHead, LEAGUE_VERSION, seasonLines, standings, type LeagueSeason } from './league.ts';
import { momentTitle, type DraftMoment } from './moments.ts';
import { finishGrade } from './report.ts';
import type { DraftRun } from './run.ts';
import { DRAFT_REPORT_SCHEMA, parseDraftReport, type DraftSharedReport, type SharedLine } from './share-report.ts';
import { RUN_VERSION } from './versions.ts';

const rate = (value: number) => value.toFixed(3).replace(/^0/, '');
const innings = (outs: number) => `${Math.floor(outs / 3)}.${outs % 3}`;

/** A hitter's season in one line: average, homers and RBI. */
const batting = (line: BatterLine): string => line.AB ? `${rate(line.H / line.AB)} AVG · ${line.HR} HR · ${line.RBI} RBI` : `${line.PA} PA`;
/** A pitcher's season in one line: runs per nine, strikeouts and innings. */
const pitching = (line: PitcherLine): string => line.outs ? `${(line.R * 27 / line.outs).toFixed(2)} RA9 · ${line.SO} K · ${innings(line.outs)} IP` : `${line.appearances} G`;

/** A box's runs by inning, as the shared moment keeps them. */
const shared = (box: GameResult['home']): SharedLine => ({ club: box.name, innings: [...box.innings], runs: box.runs });

/**
 * The shared snapshot of a finished season, checked against the shared schema. `clubName` names a
 * seat's club and `label` a card ("Name Year").
 */
export function draftShareReport(run: DraftRun, season: LeagueSeason, clubName: (seat: number) => string, label: (seasonId: string) => string): DraftSharedReport {
 const human = run.seating.humanSeat;
 const rival = season.rivals.find(pair => pair.includes(human))!.find(seat => seat !== human)!;
 const table = standings(season);
 const mine = table.find(row => row.seat === human)!;
 const series = headToHead(season, human, rival);
 const lines = seasonLines(season, human);
 const lineFor = (seasonId: string): string => {
  const hitter = lines.batting.find(line => line.seasonId === seasonId);
  const pitcher = lines.pitching.find(line => line.seasonId === seasonId);
  return hitter ? batting(hitter) : pitcher ? pitching(pitcher) : 'Did not play';
 };
 const lineup = season.lineups[human];
 const moment = (kind: 'highlight' | 'lowlight', item: DraftMoment | null) => item ? [{
  kind, title: momentTitle(item), decree: segmentDecree(run.setup.seed, item.segment).name, away: shared(item.game.away), home: shared(item.game.home)
 }] : [];
 return parseDraftReport({
  schemaVersion: DRAFT_REPORT_SCHEMA,
  runVersion: RUN_VERSION, leagueVersion: LEAGUE_VERSION, modelVersion: MODEL_VERSION, rulesVersion: RULES_VERSION, dataVersion: run.setup.dataVersion,
  seed: run.setup.seed,
  franchiseId: run.seating.seats[human],
  club: clubName(human),
  record: { wins: mine.wins, losses: mine.losses, runsFor: mine.runsFor, runsAgainst: mine.runsAgainst },
  place: table.indexOf(mine) + 1,
  grade: finishGrade(table, human),
  rival: { club: clubName(rival), wins: series.wins, losses: series.losses },
  standings: table.map(row => ({ club: clubName(row.seat), wins: row.wins, losses: row.losses, runsFor: row.runsFor, runsAgainst: row.runsAgainst, gamesBack: row.gamesBack, you: row.seat === human, rival: row.seat === rival })),
  decrees: Array.from({ length: LEAGUE_CHAPTERS }, (_, chapter) => segmentDecree(run.setup.seed, chapter * SEGMENTS_PER_CHAPTER).name),
  roster: [
   ...run.pool.rules.activeSlots.map(slot => ({ label: label(lineup.active[slot]), slot, line: lineFor(lineup.active[slot]) })),
   ...lineup.reserves.map(id => ({ label: label(id), slot: 'Res', line: lineFor(id) }))
  ],
  moments: [...moment('highlight', season.moments.highlight), ...moment('lowlight', season.moments.lowlight)]
 });
}
