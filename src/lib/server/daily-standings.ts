import { dailyDate, dailySeed, isDailyDate } from '../game/daily.ts';
import { loadCurrentDataVersion, loadReplay, REPLAY_ID_PATTERN, ReplayIncompatibleError, ReplayNotFoundError, type ReplayAssets, type ReplayBucket } from './replays.ts';
import type { Replay } from '../game/types.ts';
import { checkName, type NameRules } from './names.ts';

/** The subset of Cloudflare's D1 binding (`DAILY` in wrangler.jsonc) used here, kept structural for tests. */
export interface DailyDatabase {
	prepare(sql: string): DailyStatement;
	batch(statements: DailyStatement[]): Promise<unknown[]>;
}
export interface DailyStatement {
	bind(...values: unknown[]): DailyStatement;
	first<T = Record<string, unknown>>(): Promise<T | null>;
	all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
	run(): Promise<{ meta: { changes: number } }>;
}

export interface DailyBindings {
	DAILY?: DailyDatabase;
	REPLAYS: ReplayBucket;
	ASSETS: ReplayAssets;
}

export interface DailyRecord { wins: number; losses: number; runsFor: number; runsAgainst: number }

export interface DailyStanding {
	/** 1 + the counted runs with more wins, so ties share the better rank. */
	rank: number;
	total: number;
	/** `ceil(100 × rank / total)`: "Top 7%". */
	topPercent: number;
}

export interface DailySubmission extends DailyStanding {
	/** The record this device's day is ranked by: its first accepted submission. */
	record: DailyRecord;
	/** This entry's public id on the board, so the device can find its own row. */
	entry: string;
	/** The board name on the entry, or null for Anonymous. */
	name: string | null;
	/** Whether the name this request sent was taken; absent when it sent none. */
	nameAccepted?: boolean;
}

export interface DailyStandings {
	date: string;
	total: number;
	/** Counted runs at each win total that occurs, best first, as `[wins, count]`. */
	distribution: [number, number][];
	/** Present when the request named a win total. */
	standing?: DailyStanding;
	/** True once the day's grace period has ended and the numbers no longer change. */
	final: boolean;
}

export class DailyRequestError extends Error {
	constructor(readonly status: 400 | 404 | 409 | 410 | 503, message: string) { super(message); }
}

/** Late seasons, started before midnight New York, still count for this long after the day turns. */
export const GRACE_MS = 2 * 60 * 60 * 1000;
/** Submissions are deleted this many days after their date, like share images. */
export const RETENTION_DAYS = 90;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const MAX_RUNS = 5000;

/**
 * Ordered schema steps. The Worker applies any missing step on first use in an isolate, so the
 * schema always ships with the code that reads it. Each step's version insert runs first in its
 * transaction, so when two isolates race, the loser's whole step rolls back. Never edit a released step.
 */
const SCHEMA: readonly { version: number; statements: readonly string[] }[] = [
	{
		version: 1,
		statements: [
			`CREATE TABLE daily_submissions (
				date TEXT NOT NULL,
				device TEXT NOT NULL,
				replay_id TEXT NOT NULL,
				data_version TEXT NOT NULL,
				model_version TEXT NOT NULL,
				rules_version TEXT NOT NULL,
				wins INTEGER NOT NULL,
				losses INTEGER NOT NULL,
				runs_for INTEGER NOT NULL,
				runs_against INTEGER NOT NULL,
				name TEXT,
				name_state TEXT NOT NULL DEFAULT 'shown' CHECK (name_state IN ('shown', 'held', 'hidden')),
				status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified', 'verified', 'rejected', 'retired')),
				submitted_at TEXT NOT NULL,
				verifying_at TEXT,
				verified_at TEXT,
				PRIMARY KEY (date, device)
			)`,
			'CREATE INDEX daily_board ON daily_submissions (date, data_version, model_version, rules_version, wins DESC)',
			`CREATE TABLE devices (
				device TEXT PRIMARY KEY,
				banned_at TEXT,
				flags INTEGER NOT NULL DEFAULT 0,
				note TEXT
			)`
		]
	},
	{
		version: 2,
		statements: [
			// A random public id per entry, so the board never shows the device hash.
			'ALTER TABLE daily_submissions ADD COLUMN entry TEXT',
			"UPDATE daily_submissions SET entry = lower(hex(randomblob(8))) WHERE entry IS NULL",
			'CREATE UNIQUE INDEX daily_entry ON daily_submissions (date, entry)',
			// Set by verification; identical rosters share one board row.
			'ALTER TABLE daily_submissions ADD COLUMN roster_key TEXT',
			"CREATE TABLE name_rules (term TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('block', 'allow')))",
			`CREATE TABLE name_reports (
				date TEXT NOT NULL,
				entry TEXT NOT NULL,
				reporter TEXT NOT NULL,
				reported_at TEXT NOT NULL,
				PRIMARY KEY (date, entry, reporter)
			)`
		]
	}
];

const migrated = new WeakMap<DailyDatabase, Promise<void>>();

async function applySchema(db: DailyDatabase): Promise<void> {
	await db.prepare('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)').run();
	const row = await db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').first<{ version: number }>();
	for (const step of SCHEMA) {
		if (step.version <= (row?.version ?? 0)) continue;
		try {
			await db.batch([
				db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').bind(step.version, new Date().toISOString()),
				...step.statements.map(sql => db.prepare(sql))
			]);
		} catch (error) {
			// Another isolate applied this step first; its version row is the proof.
			const applied = await db.prepare('SELECT 1 AS applied FROM schema_migrations WHERE version = ?').bind(step.version).first();
			if (!applied) throw error;
		}
	}
}

export async function database(bindings: DailyBindings): Promise<DailyDatabase> {
	const db = bindings.DAILY;
	if (!db) throw new DailyRequestError(503, 'Daily standings are unavailable.');
	let ready = migrated.get(db);
	if (!ready) {
		ready = applySchema(db);
		ready.catch(() => migrated.delete(db));
		migrated.set(db, ready);
	}
	await ready;
	return db;
}

/** The dates that accept submissions at `now`: today, and yesterday during its grace period. */
export function liveDates(now: Date): string[] {
	return [...new Set([dailyDate(now), dailyDate(new Date(now.getTime() - GRACE_MS))])];
}

export function isFinal(date: string, now: Date): boolean {
	return date < dailyDate(new Date(now.getTime() - GRACE_MS));
}

function validRecord(value: unknown): DailyRecord {
	const record = value as Record<string, unknown> | null;
	const count = (field: string, max: number) => {
		const n = record?.[field];
		if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > max) throw new DailyRequestError(400, 'The season record is invalid.');
		return n as number;
	};
	const parsed = { wins: count('wins', 162), losses: count('losses', 162), runsFor: count('runsFor', MAX_RUNS), runsAgainst: count('runsAgainst', MAX_RUNS) };
	if (parsed.wins + parsed.losses !== 162) throw new DailyRequestError(400, 'The season record is invalid.');
	return parsed;
}

export async function deviceHash(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function validToken(value: unknown): value is string {
	return typeof value === 'string' && TOKEN.test(value);
}

/** Block and allow entries added with `wrangler d1 execute`, on top of the seed list in `names.ts`. */
async function nameRules(db: DailyDatabase): Promise<NameRules> {
	const { results } = await db.prepare('SELECT term, kind FROM name_rules').all<{ term: string; kind: 'block' | 'allow' }>();
	return { block: results.filter(rule => rule.kind === 'block').map(rule => rule.term), allow: results.filter(rule => rule.kind === 'allow').map(rule => rule.term) };
}

/** Rows that count toward a board: its versions, not rejected or retired, from devices not banned. */
export const COUNTED = `date = ?1 AND data_version = ?2 AND model_version = ?3 AND rules_version = ?4
	AND status NOT IN ('rejected', 'retired')
	AND device NOT IN (SELECT device FROM devices WHERE banned_at IS NOT NULL)`;

function standing(rank: number, total: number): DailyStanding {
	return { rank, total, topPercent: Math.ceil(100 * rank / total) };
}

/**
 * Records a device's daily season from its stored replay. Everything but the record comes from the
 * replay, and only the device's first submission for a day counts; a repeat returns that first standing.
 */
export async function submitDaily(bindings: DailyBindings, date: string, body: unknown, now = new Date()): Promise<DailySubmission> {
	if (!isDailyDate(date)) throw new DailyRequestError(404, 'That daily does not exist.');
	if (!liveDates(now).includes(date)) throw new DailyRequestError(410, 'That daily is closed.');
	const input = body as Record<string, unknown> | null;
	if (!input || !validToken(input.token) || typeof input.replayId !== 'string' || !REPLAY_ID_PATTERN.test(input.replayId)
		|| (input.name !== undefined && typeof input.name !== 'string')) {
		throw new DailyRequestError(400, 'The submission is invalid.');
	}
	const record = validRecord(input.record);
	const dataVersion = await loadCurrentDataVersion(bindings.ASSETS);
	let replay: Replay;
	try { replay = await loadReplay(bindings.REPLAYS, input.replayId, dataVersion); }
	catch (error) {
		if (error instanceof ReplayNotFoundError) throw new DailyRequestError(404, error.message);
		if (error instanceof ReplayIncompatibleError) throw new DailyRequestError(409, error.message);
		throw error;
	}
	if (replay.daily !== date || replay.seed !== dailySeed(date)) throw new DailyRequestError(409, 'That replay is not this daily’s run.');
	const db = await database(bindings);
	const device = await deviceHash(input.token);
	const cutoff = dailyDate(new Date(now.getTime() - RETENTION_DAYS * 86_400_000));
	const named = typeof input.name === 'string' ? checkName(input.name, await nameRules(db)) : null;
	const name = named?.ok ? named.name : null;
	const entry = [...crypto.getRandomValues(new Uint8Array(8))].map(byte => byte.toString(16).padStart(2, '0')).join('');
	await db.batch([
		db.prepare(`INSERT INTO daily_submissions
			(date, device, replay_id, data_version, model_version, rules_version, wins, losses, runs_for, runs_against, submitted_at, entry, name)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (date, device) DO NOTHING`)
			.bind(date, device, input.replayId, replay.dataVersion, replay.modelVersion, replay.rulesVersion, record.wins, record.losses, record.runsFor, record.runsAgainst, now.toISOString(), entry, name),
		// A device that had no accepted name may name its entry later the same day; an accepted name stays.
		db.prepare('UPDATE daily_submissions SET name = ? WHERE date = ? AND device = ? AND name IS NULL').bind(name, date, device),
		db.prepare('DELETE FROM daily_submissions WHERE date < ?').bind(cutoff),
		db.prepare('DELETE FROM name_reports WHERE date < ?').bind(cutoff)
	]);
	const mine = await db.prepare(`SELECT wins, losses, runs_for, runs_against, data_version, model_version, rules_version, status, entry, name,
		EXISTS (SELECT 1 FROM devices WHERE devices.device = daily_submissions.device AND banned_at IS NOT NULL) AS banned
		FROM daily_submissions WHERE date = ? AND device = ?`).bind(date, device)
		.first<{ wins: number; losses: number; runs_for: number; runs_against: number; data_version: string; model_version: string; rules_version: string; status: string; entry: string; name: string | null; banned: number }>();
	if (!mine) throw new DailyRequestError(503, 'Daily standings are unavailable.');
	const versions = [date, mine.data_version, mine.model_version, mine.rules_version];
	const counts = await db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(wins > ?5), 0) AS better FROM daily_submissions WHERE ${COUNTED}`)
		.bind(...versions, mine.wins).first<{ total: number; better: number }>();
	// A banned or rejected device still sees where its own run would stand.
	const counted = !mine.banned && mine.status !== 'rejected' && mine.status !== 'retired';
	const total = (counts?.total ?? 0) + (counted ? 0 : 1);
	return {
		...standing(1 + (counts?.better ?? 0), total),
		record: { wins: mine.wins, losses: mine.losses, runsFor: mine.runs_for, runsAgainst: mine.runs_against },
		entry: mine.entry,
		name: mine.name,
		...(named ? { nameAccepted: named.ok && mine.name === named.name } : {})
	};
}

/**
 * The `COUNTED` bindings for a day's board on the deployed data version: the model and rules of its latest
 * submission, since a deploy that changes either starts a new board. Null before the day's first run.
 */
export async function boardVersions(db: DailyDatabase, date: string, dataVersion: string): Promise<[string, string, string, string] | null> {
	const latest = await db.prepare('SELECT model_version, rules_version FROM daily_submissions WHERE date = ? AND data_version = ? ORDER BY submitted_at DESC LIMIT 1')
		.bind(date, dataVersion).first<{ model_version: string; rules_version: string }>();
	return latest ? [date, dataVersion, latest.model_version, latest.rules_version] : null;
}

/** A day's counted runs on the current versions, with the standing of `wins` when given. */
export async function dailyStandings(bindings: DailyBindings, date: string, wins: number | null, now = new Date()): Promise<DailyStandings> {
	if (!isDailyDate(date) || date > dailyDate(now)) throw new DailyRequestError(404, 'That daily does not exist.');
	if (wins !== null && (!Number.isInteger(wins) || wins < 0 || wins > 162)) throw new DailyRequestError(400, 'The win total is invalid.');
	const dataVersion = await loadCurrentDataVersion(bindings.ASSETS);
	const db = await database(bindings);
	const versions = await boardVersions(db, date, dataVersion);
	const final = isFinal(date, now);
	if (!versions) return { date, total: 0, distribution: [], ...(wins === null ? {} : { standing: standing(1, 1) }), final };
	const { results } = await db.prepare(`SELECT wins, COUNT(*) AS count FROM daily_submissions WHERE ${COUNTED} GROUP BY wins ORDER BY wins DESC`)
		.bind(...versions).all<{ wins: number; count: number }>();
	const distribution = results.map(row => [row.wins, row.count] as [number, number]);
	const total = distribution.reduce((sum, [, count]) => sum + count, 0);
	if (wins === null) return { date, total, distribution, final };
	const better = distribution.reduce((sum, [w, count]) => sum + (w > wins ? count : 0), 0);
	// A run not yet counted (or not counted at all) is placed among the others for its own view.
	const present = distribution.some(([w]) => w === wins);
	return { date, total, distribution, standing: standing(1 + better, present ? total : total + 1), final };
}
