import type { LegacySaves } from './legacy.ts';
import type { MigrationReport } from './migrations.ts';
import type { SqlValue, Statement } from './sql.ts';

export type DbRequest =
 | { id: number; type: 'open'; legacy: LegacySaves }
 | { id: number; type: 'all'; sql: string; bind?: SqlValue[] }
 | { id: number; type: 'run'; statements: Statement[] };

export type DbResponse = { id: number; ok: true; value: unknown } | { id: number; ok: false; message: string };

export interface OpenResult extends MigrationReport {
 /** False when the database lives only in memory for this tab. */
 persistent: boolean;
 reason: string | null;
}
