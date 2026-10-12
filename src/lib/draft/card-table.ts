import { SLOTS, type Candidate, type Slot } from '../game/types.ts';
import type { DraftCardTable } from './salary.ts';
import type { DraftCard } from './types.ts';
import { SALARY_VERSION } from './versions.ts';
import type { Finish } from '../cards/finish.ts';

export type StoredDraftCardTable = DraftCardTable & { dataVersion: string };

const FINISHES: readonly Finish[] = ['base', 'foil', 'emboss', 'gem'];

/** Joins the manifest candidates to the stored salary columns, rejecting any other data or salary version. */
export function decodeDraftCards(candidates: readonly Candidate[], table: StoredDraftCardTable, dataVersion: string): DraftCard[] {
 if (table.schemaVersion !== 1) throw new Error(`Unsupported draft card table schema ${String(table.schemaVersion)}`);
 if (table.salaryVersion !== SALARY_VERSION) throw new Error(`Draft card table uses salary ${table.salaryVersion}; this build requires ${SALARY_VERSION}`);
 if (table.dataVersion !== dataVersion) throw new Error(`Draft card table belongs to data ${table.dataVersion}, not ${dataVersion}`);
 const columns = [table.seasonId, table.year, table.salary, table.finish, table.valueRuns, table.pricedSlot];
 if (columns.some(column => !Array.isArray(column) || column.length !== candidates.length)) throw new Error('Draft card table columns do not align with the manifest candidates');
 const conflicts = new Map<string, string[]>();
 for (const [bullpen, members] of Object.entries(table.bullpenMembers)) {
  conflicts.set(bullpen, [...members]);
  for (const member of members) conflicts.set(member, [...(conflicts.get(member) ?? []), bullpen]);
 }
 return candidates.map((candidate, index) => {
  const finish = table.finish[index];
  const salary = table.salary[index];
  const pricedSlot = table.pricedSlot[index];
  const year = table.year[index];
  if (table.seasonId[index] !== candidate.seasonId) throw new Error(`Draft card table row ${index} is ${table.seasonId[index]}, expected ${candidate.seasonId}`);
  if (!FINISHES.includes(finish) || !Number.isSafeInteger(salary) || salary <= 0 || !Number.isFinite(table.valueRuns[index])
   || !(SLOTS as readonly Slot[]).includes(pricedSlot) || !candidate.eligibleSlots.includes(pricedSlot)
   || !Number.isInteger(year) || Math.floor(year / 10) * 10 !== candidate.decade) {
   throw new Error(`Invalid draft card ${candidate.seasonId}`);
  }
  return {
   seasonId: candidate.seasonId, playerId: candidate.playerId, franchiseId: candidate.franchiseId, year,
   eligibleSlots: candidate.eligibleSlots, finish,
   valueRuns: table.valueRuns[index], pricedSlot, salary, conflicts: conflicts.get(candidate.seasonId) ?? []
  };
 });
}
