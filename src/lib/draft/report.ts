import type { SeasonGrade } from '../game/grade.ts';
import type { RosterSlot } from '../game/types.ts';
import { completionReward } from '../cosmetics/ledger.ts';
import { DRAFT_STICKER_KIND, STICKER_BY_KIND, STICKER_SPOTS } from '../collection/stickers.ts';
import type { Db, Row, Statement } from '../storage/sql.ts';
import type { SeasonReward } from '../cosmetics/ledger.ts';
import { headToHead, standings, type LeagueSeason, type Standing } from './league.ts';
import type { DraftRun } from './run.ts';
import { seasonRoster } from './shop.ts';

/**
 * What a finished Draft Mode season earns and reports. Clubs are built to near parity, so the grade
 * reads the finish, not the win total; tokens and stickers are cosmetic and never reach a draft.
 */

/** A champion this many games clear of second grades S+. */
export const RUNAWAY_GAMES = 10;
/** Grade by finish, first to eighth, below a runaway champion. */
const FINISH_GRADES: readonly SeasonGrade[] = ['S', 'AA', 'A', 'B', 'C', 'C', 'D', 'F'];

/** `seat`'s place (1-8) in the final standings. */
export const finishPlace = (season: LeagueSeason, seat: number): number => standings(season).findIndex(row => row.seat === seat) + 1;

/** The finish grade for `seat`: Perfect at 162-0, S+ for a runaway champion, then by place. */
export function finishGrade(table: readonly Standing[], seat: number): SeasonGrade {
 const place = table.findIndex(row => row.seat === seat);
 const row = table[place];
 if (row.wins === 162 && row.losses === 0) return 'Perfect';
 if (place === 0 && (table[1]?.gamesBack ?? 0) >= RUNAWAY_GAMES) return 'S+';
 return FINISH_GRADES[place];
}

/** Tokens a finished season pays: one, another for a top-half finish, another for the league title. */
export const finishTokens = (place: number): number => 1 + (place <= 4 ? 1 : 0) + (place === 1 ? 1 : 0);

/** One single-token receipt per token a finish pays, under the season's key and its bonus keys. */
const finishReceipts = (key: string, place: number): string[] => [key, ...(place <= 4 ? [`${key}:top-half`] : []), ...(place === 1 ? [`${key}:title`] : [])];

/** Tokens the save stamped `stamp` granted the season filed under `key`; a later save reads as nothing new. */
export async function finishReward(db: Db, key: string, stamp: string): Promise<SeasonReward> {
 const rows = await db.all<Row & { credit: number }>('SELECT COALESCE(SUM(credit), 0) AS credit FROM shop_completions WHERE completed_at = ? AND key IN (?, ?, ?)', [stamp, key, `${key}:top-half`, `${key}:title`]);
 return { season: rows[0]?.credit ?? 0, bonus: 0, daily: 0 };
}

/** The league sticker a finished season puts on every card on the club's final roster, or null: 162-0, the title, or a won rival series. */
export function leagueSticker(run: DraftRun, season: LeagueSeason): string | null {
 const human = run.seating.humanSeat;
 const table = standings(season);
 const row = table.find(item => item.seat === human)!;
 if (row.wins === 162 && row.losses === 0) return DRAFT_STICKER_KIND.perfect;
 if (table[0].seat === human) return DRAFT_STICKER_KIND.champions(run.seating.seats[human]);
 const rival = season.rivals.find(pair => pair.includes(human))!.find(seat => seat !== human)!;
 const series = headToHead(season, human, rival);
 return series.wins > series.losses ? DRAFT_STICKER_KIND.rival : null;
}

/** The binder slot a Draft card was kept at; the deep bullpen files with the bullpen. */
const binderSlot = (slot: string): RosterSlot => slot === 'RP4' || slot === 'RP5' ? 'BP' : slot as RosterSlot;

/**
 * Statements that record a finished season under `key` ('draft:' and the run id), in the same
 * transaction as the save that finishes it: the token receipt, every card on the final roster in the
 * binder with the club's record, and the league sticker on each. Each is written once; later saves of
 * the same finished run change nothing. `label` names a card ("Name Year").
 */
export function completionStatements(run: DraftRun, season: LeagueSeason, key: string, stamp: string, label: (seasonId: string) => string): Statement[] {
 const human = run.seating.humanSeat;
 const row = standings(season).find(item => item.seat === human)!;
 const lineup = season.lineups[human];
 const slots = new Map<string, RosterSlot>([...Object.entries(lineup.active).map(([slot, id]) => [id, binderSlot(slot)] as const), ...lineup.reserves.map(id => [id, 'BP' as RosterSlot] as const)]);
 const statements: Statement[] = finishReceipts(key, finishPlace(season, human)).flatMap(receipt => completionReward(receipt, stamp));
 const roster = seasonRoster(season, human);
 for (const seasonId of roster) {
  statements.push({
   sql: `INSERT INTO rostered (season_id, season_key, rostered_at, label, slot, wins, losses, line_json) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT (season_id, season_key) DO NOTHING`,
   bind: [seasonId, key, stamp, label(seasonId), slots.get(seasonId) ?? 'BP', row.wins, row.losses]
  });
 }
 const kind = leagueSticker(run, season);
 if (kind) {
  const spot = STICKER_SPOTS[STICKER_BY_KIND.get(kind)!.family];
  for (const seasonId of roster) statements.push({ sql: 'INSERT OR IGNORE INTO stickers (season_id, kind, earned_at, season_key, x, y, hidden) VALUES (?, ?, ?, ?, ?, ?, 0)', bind: [seasonId, kind, stamp, key, spot.x, spot.y] });
 }
 return statements;
}
