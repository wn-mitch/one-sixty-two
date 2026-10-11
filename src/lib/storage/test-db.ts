import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { NO_LEGACY, type LegacySaves } from './legacy.ts';
import { migrate, type Migration } from './migrations.ts';
import { directDb, type Db, type RawDb } from './sql.ts';

let module: ReturnType<typeof sqlite3InitModule> | null = null;

/** A fresh in-memory device database for Node tests, migrated like the browser one. */
export async function memoryDb(legacy: LegacySaves = NO_LEGACY, migrations?: readonly Migration[]): Promise<{ db: Db; raw: RawDb }> {
 module ??= sqlite3InitModule();
 const sqlite3 = await module;
 const raw = new sqlite3.oo1.DB(':memory:', 'c') as unknown as RawDb;
 migrate(raw, legacy, migrations);
 return { db: directDb(raw), raw };
}

/** A database whose every call fails, standing in for blocked or broken device storage. */
export const brokenDb: Db = {
 all: () => Promise.reject(new Error('blocked')),
 run: () => Promise.reject(new Error('blocked'))
};
