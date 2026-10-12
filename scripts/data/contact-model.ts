import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContactBasis, type ContactReference } from '../../src/lib/engine/node.ts';
import type { StadiumConfig } from '../../src/lib/sim/park-types.ts';
import { CONTACT_METHOD_VERSION, type ContactModel, type ContactShape } from '../../src/lib/sim/contact-profile.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const STATCAST_SHAPE_FILE = 'scripts/data/statcast-2025.json';
/** Sources whose behavior determines the neutral response basis. */
export const CONTACT_BASIS_SOURCES = [
 STATCAST_SHAPE_FILE,
 'engine/src/contact_basis.rs', 'engine/src/contact_profile.rs', 'engine/src/fielding.rs', 'engine/src/flight.rs',
 'engine/src/math.rs', 'engine/src/normal.rs', 'engine/src/prep.rs', 'engine/src/types.rs', 'Cargo.lock',
 'src/lib/sim/park.ts', 'src/lib/sim/park-types.ts'
];

export function readContactShape(): ContactShape {
 return JSON.parse(readFileSync(join(root, STATCAST_SHAPE_FILE), 'utf8')) as ContactShape;
}

let loaded: ContactModel | null = null;
/**
 * The league contact model. Building the basis traces the full neutral lattice, so the result is
 * cached under `.cache/contact-basis/` by the hash of every source that determines it.
 */
export function loadContactModel(): ContactModel {
 if (loaded) return loaded;
 const hash = createHash('sha256');
 for (const file of CONTACT_BASIS_SOURCES) hash.update(file).update(readFileSync(join(root, file)));
 const cacheFile = join(root, '.cache/contact-basis', `${hash.digest('hex')}.json`);
 const shape = readContactShape();
 let basis: ContactModel['basis'];
 try { basis = JSON.parse(readFileSync(cacheFile, 'utf8')) as ContactModel['basis']; }
 catch {
  basis = buildContactBasis(shape);
  mkdirSync(dirname(cacheFile), { recursive: true });
  const temporary = `${cacheFile}.${randomUUID()}`;
  writeFileSync(temporary, JSON.stringify(basis));
  renameSync(temporary, cacheFile);
 }
 loaded = { methodVersion: CONTACT_METHOD_VERSION, provenance: 'estimated', shape, basis };
 return loaded;
}

/**
 * One park's traced outcome classes for Draft park fit, cached under `.cache/park-basis/` by the
 * contact basis sources and the stadium configuration, since each trace takes seconds.
 */
export function cachedParkBasis(reference: ContactReference, stadium: StadiumConfig): Float64Array {
 const hash = createHash('sha256');
 for (const file of CONTACT_BASIS_SOURCES) hash.update(file).update(readFileSync(join(root, file)));
 hash.update(JSON.stringify(stadium));
 const cacheFile = join(root, '.cache/park-basis', `${hash.digest('hex')}.bin`);
 try {
  const bytes = readFileSync(cacheFile);
  return new Float64Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
 } catch {
  const basis = reference.parkBasis(stadium);
  mkdirSync(dirname(cacheFile), { recursive: true });
  const temporary = `${cacheFile}.${randomUUID()}`;
  writeFileSync(temporary, new Uint8Array(basis.buffer, basis.byteOffset, basis.byteLength));
  renameSync(temporary, cacheFile);
  return basis;
 }
}
