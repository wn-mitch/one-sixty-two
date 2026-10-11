import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { migrate } from './migrations.ts';
import { apply, query, type RawDb } from './sql.ts';
import type { DbRequest, DbResponse, OpenResult } from './protocol.ts';

const FILE = '/162-zero.sqlite3';
let db: RawDb | null = null;

/**
 * Opens the device database on OPFS through the SyncAccessHandle pool, which needs no cross-origin
 * isolation. The pool admits one tab at a time, so a second tab (or a browser without OPFS) gets a
 * memory database and is told its saves will not persist.
 */
async function open(request: Extract<DbRequest, { type: 'open' }>): Promise<OpenResult> {
 const sqlite3 = await sqlite3InitModule();
 let persistent = true;
 let reason: string | null = null;
 try {
  // A reloaded page's previous worker can hold the access handles for a moment after unload.
  let pool: Awaited<ReturnType<typeof sqlite3.installOpfsSAHPoolVfs>> | null = null;
  for (let attempt = 0; !pool; attempt++) {
   // `forceReinitIfPreviouslyFailed` (missing from the bundled types) lets a failed install be retried.
   const options = { name: '162-zero', initialCapacity: 6, forceReinitIfPreviouslyFailed: true };
   try { pool = await sqlite3.installOpfsSAHPoolVfs(options); }
   catch (error) {
    if (attempt >= 4 || !('createSyncAccessHandle' in (globalThis.FileSystemFileHandle?.prototype ?? {}))) throw error;
    await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
   }
  }
  db = new pool.OpfsSAHPoolDb(FILE) as unknown as RawDb;
 } catch (error) {
  persistent = false;
  reason = error instanceof Error ? error.message : String(error);
  db = new sqlite3.oo1.DB(':memory:', 'c') as unknown as RawDb;
 }
 const migration = migrate(db, request.legacy);
 return { persistent, reason, ...migration };
}

self.onmessage = async (event: MessageEvent<DbRequest>) => {
 const request = event.data;
 const reply = (message: DbResponse) => self.postMessage(message);
 try {
  if (request.type === 'open') reply({ id: request.id, ok: true, value: await open(request) });
  else if (!db) throw new Error('The device database is not open.');
  else if (request.type === 'all') reply({ id: request.id, ok: true, value: query(db, request.sql, request.bind) });
  else { apply(db, request.statements); reply({ id: request.id, ok: true, value: null }); }
 } catch (error) {
  reply({ id: request.id, ok: false, message: error instanceof Error ? error.message : String(error) });
 }
};
