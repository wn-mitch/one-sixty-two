/** Values the device database stores; JSON documents are text columns. */
export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;
export interface Statement { sql: string; bind?: SqlValue[] }

/** The asynchronous device database the game modules use; `run` applies its statements atomically. */
export interface Db {
 all<T extends Row = Row>(sql: string, bind?: SqlValue[]): Promise<T[]>;
 run(statements: Statement[]): Promise<void>;
}

/** The synchronous subset of the SQLite oo1 `Database` the worker and the tests drive. */
export interface RawDb {
 exec(options: { sql: string; bind?: SqlValue[] }): unknown;
 selectObjects(sql: string, bind?: SqlValue[]): Record<string, unknown>[];
 selectValue(sql: string, bind?: SqlValue[]): unknown;
 transaction<T>(callback: (db: RawDb) => T): T;
}

export function query<T extends Row>(raw: RawDb, sql: string, bind?: SqlValue[]): T[] {
 return raw.selectObjects(sql, bind) as T[];
}

export function apply(raw: RawDb, statements: readonly Statement[]): void {
 raw.transaction(db => { for (const statement of statements) db.exec({ sql: statement.sql, bind: statement.bind }); });
}

/** A `Db` over a raw connection in the same thread; the worker serves the same two calls by message. */
export function directDb(raw: RawDb): Db {
 return {
  all: async <T extends Row>(sql: string, bind?: SqlValue[]) => query<T>(raw, sql, bind),
  run: async statements => apply(raw, statements)
 };
}

export const json = (value: unknown): string => JSON.stringify(value);
export function parseJson<T>(text: SqlValue): T | undefined {
 if (typeof text !== 'string') return undefined;
 try { return JSON.parse(text) as T; } catch { return undefined; }
}
