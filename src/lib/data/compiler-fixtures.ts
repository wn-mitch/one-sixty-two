import { POSITIONS, type Attribution } from '../game/types.ts';
import type { Row, Tables } from '../../../scripts/data/counts.ts';

export const syntheticAttribution: Attribution = { title: 'Synthetic test data', credit: 'Anonymous fixtures', sourceUrl: 'https://example.invalid/source', license: 'Synthetic test licence', licenseUrl: 'https://example.invalid/license', sourceCommit: 'fixture', changes: 'Synthetic counts only', fullNotice: 'Synthetic test notice' };

export function syntheticTables(): Tables {
 const tables: Tables = { Teams: [], TeamsFranchises: [], People: [], Batting: [], Pitching: [], Appearances: [], Fielding: [], FieldingOFsplit: [] };
 for (let index = 0; index < 30; index++) tables.TeamsFranchises.push({ franchID: `F${index}`, franchName: 'Old unused label' });
 const years = [1961, 1970, 1980, 1990, 2000, 2010, 2025];
 for (const year of years) {
  const teamCount = year === 2025 ? 30 : 2;
  for (let index = 0; index < teamCount; index++) {
   const key: Row = { yearID: String(year), lgID: index % 2 ? 'NL' : 'AL', teamID: year === 2025 ? `NEW${index}` : `OLD${index}` };
   tables.Teams.push({ ...key, franchID: `F${index}`, name: year === 2025 ? `Current club ${index}` : `Historical club ${index}`, G: '162', R: '720', BPF: '100', PPF: '100' });
   for (let player = 0; player < 16; player++) {
    const playerID = `anonymous-${year}-${index}-${player}`;
    const row = { ...key, playerID };
    tables.People.push({ ID: String(tables.People.length), playerID, nameFirst: 'Player', nameLast: String(tables.People.length), bats: 'R', throws: 'R' });
    if (player < 9) {
     tables.Batting.push({ ...row, stint: '1', AB: '280', H: '80', '2B': '15', '3B': '3', HR: '10', BB: '30', HBP: '3', SO: '50', SH: '1', SF: '3', SB: '5', CS: '2', GIDP: '5' });
     tables.Appearances.push({ ...row, ...(player < 8 ? { [`G_${POSITIONS[player].toLowerCase()}`]: '100' } : {}) });
     if (player < 8) {
      const field = { ...row, stint: '1', POS: POSITIONS[player], PO: '100', A: '40', E: '2', InnOuts: '900', SB: player === 0 ? '20' : '', CS: player === 0 ? '10' : '' };
      if (player >= 5) tables.FieldingOFsplit.push(field);
      else tables.Fielding.push(field);
     }
    } else {
     const starter = player < 14;
     tables.Pitching.push({ ...row, stint: '1', G: starter ? '25' : '50', GS: starter ? '20' : '0', IPouts: starter ? '360' : '180', H: starter ? '100' : '50', HR: starter ? '10' : '5', BB: starter ? '40' : '20', HBP: '3', SO: starter ? '100' : '50', BFP: starter ? '550' : '275', ER: '20', SV: player === 14 ? '30' : '0' });
    }
   }
  }
 }
 return tables;
}
