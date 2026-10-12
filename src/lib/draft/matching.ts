/**
 * Minimum-cost assignment of every row to a distinct column (rows <= columns), Hungarian method with
 * potentials. `cost(row, column)` returns null for a forbidden pair. Returns null when no complete
 * assignment exists.
 */
export function minimumCostAssignment(rows: number, columns: number, cost: (row: number, column: number) => number | null): { column: Int32Array; total: number } | null {
 if (rows > columns) return null;
 if (rows === 0) return { column: new Int32Array(0), total: 0 };
 const FORBIDDEN = 1e12;
 const matrix = new Float64Array(rows * columns);
 for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
  const value = cost(row, column);
  if (value !== null && !Number.isFinite(value)) throw new Error('Assignment costs must be finite');
  matrix[row * columns + column] = value ?? FORBIDDEN;
 }
 // 1-indexed potentials: u for rows, v for columns; way/p track the alternating tree.
 const u = new Float64Array(rows + 1), v = new Float64Array(columns + 1);
 const p = new Int32Array(columns + 1), way = new Int32Array(columns + 1);
 const minimum = new Float64Array(columns + 1);
 const used = new Uint8Array(columns + 1);
 for (let row = 1; row <= rows; row++) {
  p[0] = row;
  let column0 = 0;
  minimum.fill(Infinity);
  used.fill(0);
  do {
   used[column0] = 1;
   const row0 = p[column0];
   let delta = Infinity, column1 = 0;
   for (let column = 1; column <= columns; column++) {
    if (used[column]) continue;
    const reduced = matrix[(row0 - 1) * columns + column - 1] - u[row0] - v[column];
    if (reduced < minimum[column]) { minimum[column] = reduced; way[column] = column0; }
    if (minimum[column] < delta) { delta = minimum[column]; column1 = column; }
   }
   for (let column = 0; column <= columns; column++) {
    if (used[column]) { u[p[column]] += delta; v[column] -= delta; }
    else minimum[column] -= delta;
   }
   column0 = column1;
  } while (p[column0] !== 0);
  do {
   const column1 = way[column0];
   p[column0] = p[column1];
   column0 = column1;
  } while (column0);
 }
 const assigned = new Int32Array(rows).fill(-1);
 let total = 0;
 for (let column = 1; column <= columns; column++) {
  if (p[column] === 0) continue;
  const value = matrix[(p[column] - 1) * columns + column - 1];
  if (value >= FORBIDDEN) return null;
  assigned[p[column] - 1] = column - 1;
  total += value;
 }
 return { column: assigned, total };
}
