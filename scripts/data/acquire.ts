import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parse } from 'csv-parse/sync';

export const SOURCE_COMMIT = 'b5e7327707fff91ff3bdcbe1f6892c8c5015cf1d';

const SOURCE_BASE_URL =
	`https://raw.githubusercontent.com/corbtastik/lahman-baseball-db/${SOURCE_COMMIT}`;

export const CHECKSUMS = {
	'Teams.csv': '0e7afdd8b837d0edaca770a28817eec6613bd8255979c1be6e3f5827f4b88fd6',
	'TeamsFranchises.csv': 'fc58735a8f767f11c27bccbbee38ea850a00e27c0216fb2a60cc4185a99bf398',
	'Batting.csv': '007551e2fe3072aff396a8573de61dceabe14dbf8de20038c8b60e2abe16978f',
	'Pitching.csv': 'dbbe1baeb0a0fd81c1843a19eb4967e3d86c073fbe51bf96581bfd9faae35951',
	'Fielding.csv': '0b4dc11fab05f59fd281ea716c9b1f9ead3fe6b838a33914998d1727d31e0135',
	'FieldingOFsplit.csv': 'c566d92027432dfa88527bf95721cd30fb0115c4163d009394d0454aa3bbb926',
	'Appearances.csv': '4aa1883276a86b9b8ceaa08b3d030044d187766fb758fc973ec12d3a24f6fe08',
	'People.csv': '9ee97110fc88b2c4ad72684577d696875035049e74a45cb93238458df8563c58'
} as const satisfies Record<string, string>;

export type CsvRow = Record<string, string>;
export type AcquiredTables = Record<string, CsvRow[]>;

interface FetchResponse {
	ok: boolean;
	status: number;
	statusText?: string;
	arrayBuffer(): Promise<ArrayBuffer>;
}

export interface AcquisitionInput {
	cacheDir: string;
	baseUrl: string;
	checksums: Readonly<Record<string, string>>;
	fetch(url: string): Promise<FetchResponse>;
}

function sha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function verifyChecksum(filename: string, bytes: Uint8Array, expected: string): void {
	const actual = sha256(bytes);
	if (actual !== expected) {
		throw new Error(
			`Checksum mismatch for ${filename}: expected ${expected}, received ${actual}`
		);
	}
}

export function parseCsv(filename: string, bytes: Uint8Array): CsvRow[] {
	try {
		return parse<CsvRow>(bytes, {
			bom: true,
			columns: true,
			skip_empty_lines: true
		});
	} catch (error) {
		throw new Error(`Unable to parse ${filename} as CSV`, { cause: error });
	}
}

function isMissingFile(error: unknown): boolean {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function readCache(path: string): Promise<Buffer | null> {
	try {
		return await readFile(path);
	} catch (error) {
		if (isMissingFile(error)) return null;
		throw error;
	}
}

async function writeCache(path: string, bytes: Uint8Array): Promise<void> {
	const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(temporaryPath, bytes);
	try {
		await rename(temporaryPath, path);
	} catch (error) {
		await rm(temporaryPath, { force: true }).catch(() => undefined);
		throw error;
	}
}

async function acquireBytes(
	filename: string,
	expectedChecksum: string,
	input: AcquisitionInput,
	offline: boolean
): Promise<Uint8Array> {
	const cachePath = join(input.cacheDir, filename);
	const cached = await readCache(cachePath);
	if (cached) {
		try {
			verifyChecksum(filename, cached, expectedChecksum);
			return cached;
		} catch (error) {
			if (offline) {
				throw new Error(`Offline acquisition requires a verified cache entry for ${filename}`, {
					cause: error
				});
			}
		}
	} else if (offline) {
		throw new Error(
			`Offline acquisition requires a verified cache entry for ${filename} at ${cachePath}`
		);
	}

	const url = `${input.baseUrl.replace(/\/$/, '')}/${filename}`;
	let response: FetchResponse;
	try {
		response = await input.fetch(url);
	} catch (error) {
		throw new Error(`Unable to download ${filename} from ${url}`, { cause: error });
	}
	if (!response.ok) {
		const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
		throw new Error(`Unable to download ${filename} from ${url}: HTTP ${status}`);
	}

	const downloaded = new Uint8Array(await response.arrayBuffer());
	verifyChecksum(filename, downloaded, expectedChecksum);
	await mkdir(input.cacheDir, { recursive: true });
	await writeCache(cachePath, downloaded);
	return downloaded;
}

/**
 * Injectable acquisition entry point used by focused tests. Production callers
 * should use acquireTables so the immutable source and checksums cannot drift.
 */
export async function acquireTablesFrom(
	input: AcquisitionInput,
	offline = false
): Promise<AcquiredTables> {
	const filenames = Object.keys(input.checksums);
	const tables = await Promise.all(
		filenames.map(async (filename) => {
			const bytes = await acquireBytes(filename, input.checksums[filename], input, offline);
			return [basename(filename, '.csv'), parseCsv(filename, bytes)] as const;
		})
	);
	return Object.fromEntries(tables);
}

export async function acquireTables(offline = false): Promise<AcquiredTables> {
	return acquireTablesFrom(
		{
			cacheDir: join(process.cwd(), '.cache', 'lahman'),
			baseUrl: SOURCE_BASE_URL,
			checksums: CHECKSUMS,
			fetch: (url) => fetch(url)
		},
		offline
	);
}
