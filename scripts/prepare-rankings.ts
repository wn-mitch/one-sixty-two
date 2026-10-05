import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { acquireTables } from './data/acquire.ts';
import { canonicalJSON } from './data/compile.ts';
import { compileRankings, type RankingDiagnostics } from './rankings/compile.ts';
import {
	acquireRankingsSource,
	RANKINGS_SOURCE_CHECKSUM,
	RANKINGS_SOURCE_FILE
} from './rankings/source.ts';

const CORE_DATA_VERSION = '7796022550160442ae72cd544986c1c9324b38d50a0bd122aa19f591280be37f';
const outputDir = 'static/rankings';
const cacheDir = '.cache/rankings';
const offline = process.argv.includes('--offline');
const unknownArguments = process.argv.slice(2).filter(argument => argument !== '--offline');
if (unknownArguments.length) throw new Error(`Unknown rankings preparation arguments: ${unknownArguments.join(' ')}`);

interface PreparedCache {
	compilerHash: string;
	dataVersion: string;
	rankingVersion: string;
	assets: Record<string, string>;
}

async function optionalBytes(path: string): Promise<Buffer | null> {
	try {
		return await readFile(path);
	} catch (error) {
		if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
		throw error;
	}
}

function fileDigest(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

async function reusePrepared(compilerHash: string): Promise<boolean> {
	const bytes = await optionalBytes(join(cacheDir, 'prepared.json'));
	if (!bytes) return false;
	let cache: PreparedCache;
	try {
		cache = JSON.parse(bytes.toString('utf8')) as PreparedCache;
	} catch {
		return false;
	}
	if (cache.compilerHash !== compilerHash || cache.dataVersion !== CORE_DATA_VERSION || !/^[a-f0-9]{64}$/.test(cache.rankingVersion)) return false;
	const source = await optionalBytes(join(cacheDir, RANKINGS_SOURCE_FILE));
	if (!source || fileDigest(source) !== RANKINGS_SOURCE_CHECKSUM) return false;
	for (const [filename, checksum] of Object.entries(cache.assets)) {
		if (!/^(current\.json|[a-f0-9]{64}\/(manifest\.json|diagnostics\.json|source-license\.txt))$/.test(filename)) return false;
		const asset = await optionalBytes(join(outputDir, filename));
		if (!asset || fileDigest(asset) !== checksum) return false;
	}
	if (!cache.assets['current.json'] || !cache.assets[`${cache.rankingVersion}/manifest.json`]) return false;
	console.log(`Verified cached WAR rankings ${cache.rankingVersion}; source checksum and generated assets match.`);
	return true;
}

async function readCoreDataVersion(): Promise<string> {
	const pointer = await optionalBytes('static/data/current.json');
	if (!pointer) throw new Error('Core data pointer is missing; run npm run data:prepare first.');
	let parsed: unknown;
	try {
		parsed = JSON.parse(pointer.toString('utf8'));
	} catch (error) {
		throw new Error('Core data pointer is invalid; run npm run data:prepare first.', { cause: error });
	}
	if (!parsed || typeof parsed !== 'object' || !('dataVersion' in parsed) || parsed.dataVersion !== CORE_DATA_VERSION) {
		throw new Error(`Core data version must remain ${CORE_DATA_VERSION}; run npm run data:prepare first.`);
	}
	return CORE_DATA_VERSION;
}

async function compilerHash(dataVersion: string): Promise<string> {
	const hash = createHash('sha256').update(dataVersion).update(RANKINGS_SOURCE_CHECKSUM);
	for (const filename of ['scripts/prepare-rankings.ts', 'scripts/rankings/source.ts', 'scripts/rankings/compile.ts', 'src/lib/rankings/types.ts']) {
		hash.update(filename).update(await readFile(filename));
	}
	return hash.digest('hex');
}

async function writeAsset(path: string, value: string): Promise<string> {
	await writeFile(path, value);
	return fileDigest(Buffer.from(value));
}

async function prepare(): Promise<void> {
	const dataVersion = await readCoreDataVersion();
	const tables = await acquireTables(offline);
	const sourceTables = await acquireRankingsSource(offline);
	const warRows = sourceTables[RANKINGS_SOURCE_FILE.replace(/\.csv$/, '')];
	if (!warRows) throw new Error(`Pinned rankings source ${RANKINGS_SOURCE_FILE} was not parsed.`);
	const hash = await compilerHash(dataVersion);
	if (await reusePrepared(hash)) return;
	const compilation = compileRankings(dataVersion, warRows, tables);
	const { rankings, diagnostics } = compilation;
	const directory = join(outputDir, rankings.rankingVersion);
	await mkdir(directory, { recursive: true });
	const assets: Record<string, string> = {};
	const manifest = `${canonicalJSON(rankings)}\n`;
	const diagnosticsJson = `${canonicalJSON(diagnostics)}\n`;
	const license = `${rankings.source.licenceText}\n`;
	assets[`${rankings.rankingVersion}/manifest.json`] = await writeAsset(join(directory, 'manifest.json'), manifest);
	assets[`${rankings.rankingVersion}/diagnostics.json`] = await writeAsset(join(directory, 'diagnostics.json'), diagnosticsJson);
	assets[`${rankings.rankingVersion}/source-license.txt`] = await writeAsset(join(directory, 'source-license.txt'), license);
	const pointer = `${canonicalJSON({ schemaVersion: 1, dataVersion, rankingVersion: rankings.rankingVersion, manifestUrl: `/rankings/${rankings.rankingVersion}/manifest.json` })}\n`;
	const temporaryPointer = join(outputDir, `.current-${randomUUID()}.json`);
	await writeFile(temporaryPointer, pointer);
	await rename(temporaryPointer, join(outputDir, 'current.json'));
	assets['current.json'] = fileDigest(Buffer.from(pointer));
	await mkdir(cacheDir, { recursive: true });
	await writeFile(join(cacheDir, 'prepared.json'), canonicalJSON({ compilerHash: hash, dataVersion, rankingVersion: rankings.rankingVersion, assets } satisfies PreparedCache));
	const report = diagnostics as RankingDiagnostics;
	console.log(`Prepared WAR rankings ${rankings.rankingVersion}: ${rankings.coverage.candidates} candidates, ${rankings.coverage.batting} batting and ${rankings.coverage.pitching} pitching matches.`);
	console.log(`Missing role values: batting ${report.missingBatting} (${report.missingBattingNoSource} without source role, ${report.missingBattingUnavailable} source values unavailable), pitching ${report.missingPitching} (${report.missingPitchingNoSource} without source role, ${report.missingPitchingUnavailable} source values unavailable), both ${report.missingBoth}; unmatched people ${report.unmatchedPeople}, teams ${report.unmatchedTeams}, franchise mismatches resolved with Lahman ${report.franchiseMismatches}.`);
	console.log(`Truncated-capture source rows dropped: ${report.partialSeasonRows}; those seasons are published as ranking unavailable instead of a fraction-of-season rate.`);
}

await prepare();
