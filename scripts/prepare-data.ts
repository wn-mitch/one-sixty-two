import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acquireTables, CHECKSUMS, SOURCE_COMMIT } from './data/acquire.ts';
import { acquireAttribution, writeArchive } from './data/attribution.ts';
import { canonicalJSON, compileData } from './data/compile.ts';
import { acquireRankingsSource, RANKINGS_SOURCE_CHECKSUM, RANKINGS_SOURCE_COMMIT, RANKINGS_SOURCE_FILE } from './rankings/source.ts';

interface PreparedCache { compilerHash: string; dataVersion: string; assets: Record<string, string>; gallery: string[] }
const cacheDir = '.cache/lahman';
const outputDir = 'static/data';
const offline = process.argv.includes('--offline');
const unknownArguments = process.argv.slice(2).filter(argument => argument !== '--offline');
if (unknownArguments.length) throw new Error(`Unknown preparation arguments: ${unknownArguments.join(' ')}`);

async function optionalBytes(path: string): Promise<Buffer | null> {
 try { return await readFile(path); }
 catch (error) {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
  throw error;
 }
}

async function reusePrepared(compilerHash: string): Promise<boolean> {
 const bytes = await optionalBytes(join(cacheDir, 'prepared.json'));
 if (!bytes) return false;
 let cache: PreparedCache;
 try { cache = JSON.parse(bytes.toString('utf8')) as PreparedCache; }
 catch { console.warn('Invalid prepared-cache metadata; rebuilding generated data.'); return false; }
 if (cache.compilerHash !== compilerHash || !/^[a-f0-9]{64}$/.test(cache.dataVersion) || !cache.assets || typeof cache.assets !== 'object' || !Array.isArray(cache.gallery) || cache.gallery.length === 0) return false;
 // An offline fast path still verifies every pinned raw input, not merely a previous success flag.
 for (const [filename, checksum] of Object.entries(CHECKSUMS)) {
  const raw = await optionalBytes(join(cacheDir, filename));
  if (!raw || createHash('sha256').update(raw).digest('hex') !== checksum) return false;
 }
 const warSource = await optionalBytes(join('.cache/rankings', RANKINGS_SOURCE_FILE));
 if (!warSource || createHash('sha256').update(warSource).digest('hex') !== RANKINGS_SOURCE_CHECKSUM) return false;
 if (!cache.assets['current.json'] || !cache.assets[`${cache.dataVersion}/manifest.json`] || !cache.assets[`${cache.dataVersion}/showcase.json`] || !cache.assets[`${cache.dataVersion}/defense-source.json`] || !cache.assets[`${cache.dataVersion}/transformed-data.tar.gz`] || cache.gallery.some(filename => !filename.startsWith(`${cache.dataVersion}/gallery-`) || !cache.assets[filename])) return false;
 for (const [filename, checksum] of Object.entries(cache.assets)) {
  if (!/^(current\.json|[a-f0-9]{64}\/[A-Za-z0-9_.-]+)$/.test(filename)) return false;
  const asset = await optionalBytes(join(outputDir, filename));
  if (!asset || createHash('sha256').update(asset).digest('hex') !== checksum) return false;
 }
 console.log(`Verified cached data ${cache.dataVersion}; every required source checksum and generated asset matches.`);
 return true;
}

async function prepare(): Promise<void> {
 const attribution = await acquireAttribution(offline);
 const simulationFiles = (await readdir('src/lib/sim')).filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts')).sort().map(name => `src/lib/sim/${name}`);
 const compilerFiles = ['scripts/prepare-data.ts', 'scripts/rankings/source.ts', 'src/lib/cards/finish.ts', 'src/lib/game/types.ts', ...simulationFiles, ...(await readdir('scripts/data')).filter(name => name.endsWith('.ts')).sort().map(name => `scripts/data/${name}`)];
 const hash = createHash('sha256').update(SOURCE_COMMIT).update(canonicalJSON(CHECKSUMS)).update(RANKINGS_SOURCE_COMMIT).update(RANKINGS_SOURCE_CHECKSUM).update(canonicalJSON(attribution));
 for (const filename of compilerFiles) hash.update(filename).update(await readFile(filename));
 const compilerHash = hash.digest('hex');
 if (await reusePrepared(compilerHash)) return;
 const [tables, sourceTables] = await Promise.all([acquireTables(offline), acquireRankingsSource(offline)]);
 const warRows = sourceTables[RANKINGS_SOURCE_FILE.replace(/\.csv$/, '')];
 if (!warRows) throw new Error(`Pinned defensive source ${RANKINGS_SOURCE_FILE} was not parsed.`);
 const compilation = compileData(tables, attribution, SOURCE_COMMIT, warRows);
 const { dataVersion } = compilation.manifest;
 const dir = join(outputDir, dataVersion);
 await mkdir(dir, { recursive: true });
 const assets: Record<string, string> = {};
 for (const [filename, data] of Object.entries(compilation.files)) {
  const bytes = `${canonicalJSON(data)}\n`;
  await writeFile(join(dir, filename), bytes);
  assets[`${dataVersion}/${filename}`] = createHash('sha256').update(bytes).digest('hex');
 }
 await writeArchive(dir, compilation.payload, attribution);
 assets[`${dataVersion}/transformed-data.tar.gz`] = createHash('sha256').update(await readFile(join(dir, 'transformed-data.tar.gz'))).digest('hex');
 const pointer = `${canonicalJSON({ schemaVersion: 1, dataVersion, manifestUrl: `/data/${dataVersion}/manifest.json` })}\n`;
 const temporaryPointer = join(outputDir, `.current-${randomUUID()}.json`);
 await writeFile(temporaryPointer, pointer);
 await rename(temporaryPointer, join(outputDir, 'current.json'));
 assets['current.json'] = createHash('sha256').update(pointer).digest('hex');
 await mkdir(cacheDir, { recursive: true });
 const temporaryCache = join(cacheDir, `.prepared-${randomUUID()}.json`);
 await writeFile(temporaryCache, canonicalJSON({ compilerHash, dataVersion, assets, gallery: Object.keys(compilation.files).filter(filename => filename.startsWith('gallery-')).map(filename => `${dataVersion}/${filename}`) } satisfies PreparedCache));
 await rename(temporaryCache, join(cacheDir, 'prepared.json'));
 const diagnostics = compilation.manifest.diagnostics;
 console.log(`Prepared ${compilation.manifest.candidates.length} candidates, 30 opponents and ${Object.keys(compilation.manifest.chunks).length} franchise-decade chunks: ${dataVersion}`);
 console.log(`Diagnostics: ${diagnostics.excludedBatting} batting, ${diagnostics.excludedPitching} pitching, ${diagnostics.excludedProfiles} profile exclusions; ${diagnostics.estimatedProfiles} candidates have labelled estimates. Full identifier-only diagnostics: ${dir}/diagnostics.json`);
 for (const message of compilation.diagnostics.slice(0, 20)) console.warn(message);
 if (compilation.diagnostics.length > 20) console.warn(`${compilation.diagnostics.length - 20} additional diagnostics are recorded in diagnostics.json.`);
}

await prepare();
