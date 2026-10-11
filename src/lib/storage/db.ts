import { LEGACY_KEYS, NO_LEGACY, readLegacy, type LegacySaves } from './legacy.ts';
import type { DbRequest, DbResponse, OpenResult } from './protocol.ts';
import type { Db, Row, SqlValue, Statement } from './sql.ts';

export interface DeviceDb {
 db: Db;
 /** Shown once when saves will not outlive this tab; null when they persist. */
 notice: string | null;
}

export const MEMORY_NOTICE = 'Saves are off in this tab: another tab has 162-0 open, or this browser cannot keep device data.';

type Distribute<T> = T extends unknown ? Omit<T, 'id'> : never;

function connect(): Promise<DeviceDb> {
 const worker = new Worker(new URL('./db.worker.ts', import.meta.url), { type: 'module' });
 const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
 let next = 0;
 worker.onmessage = (event: MessageEvent<DbResponse>) => {
  const waiter = pending.get(event.data.id);
  if (!waiter) return;
  pending.delete(event.data.id);
  if (event.data.ok) waiter.resolve(event.data.value);
  else waiter.reject(new Error(event.data.message));
 };
 worker.onerror = event => {
  for (const waiter of pending.values()) waiter.reject(new Error(event.message || 'The device database failed to start.'));
  pending.clear();
 };
 const send = <T>(request: Distribute<DbRequest>): Promise<T> => new Promise((resolve, reject) => {
  const id = next++;
  pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
  worker.postMessage({ ...request, id });
 });

 let legacy: LegacySaves = NO_LEGACY;
 try { legacy = readLegacy(localStorage); } catch { /* blocked storage has nothing to import */ }
 return send<OpenResult>({ type: 'open', legacy }).then(opened => {
  // The import is durable only on OPFS; a memory database leaves the legacy keys for a later tab.
  if (opened.persistent) {
   try { for (const key of Object.values(LEGACY_KEYS)) localStorage.removeItem(key); } catch { /* already imported */ }
  }
  const db: Db = {
   all: <T extends Row>(sql: string, bind?: SqlValue[]) => send<T[]>({ type: 'all', sql, bind }),
   run: (statements: Statement[]) => send<void>({ type: 'run', statements })
  };
  return { db, notice: opened.persistent ? null : MEMORY_NOTICE };
 }, error => {
  // Release the OPFS handles so a retry can open the file again.
  worker.terminate();
  throw error;
 });
}

let connection: Promise<DeviceDb> | null = null;

/** The tab's device database, opened and migrated on first use. A failed open is retried on the next call. */
export function deviceDb(): Promise<DeviceDb> {
 connection ??= connect().catch(error => { connection = null; throw error; });
 return connection;
}

/** Browser tests inspect and stage device saves through this page hook; it is the player's own data. */
if (typeof window !== 'undefined') {
 (window as unknown as { __deviceDb?: Db }).__deviceDb = {
  all: (sql, bind) => deviceDb().then(device => device.db.all(sql, bind)),
  run: statements => deviceDb().then(device => device.db.run(statements))
 };
}
