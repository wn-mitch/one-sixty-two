import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireTablesFrom, parseCsv } from '../../../scripts/data/acquire.ts';
import type { AcquisitionInput } from '../../../scripts/data/acquire.ts';
import { writeArchive } from '../../../scripts/data/attribution.ts';
import type { Attribution } from '../game/types.ts';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), '162-zero-acquire-'));
	temporaryDirectories.push(directory);
	return directory;
}

function checksum(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function successfulResponse(bytes: Uint8Array) {
	return {
		ok: true,
		status: 200,
		statusText: 'OK',
		async arrayBuffer(): Promise<ArrayBuffer> {
			return new Uint8Array(bytes).buffer;
		}
	};
}

function inputFor(
	cacheDir: string,
	expectedChecksum: string,
	fetchInput: AcquisitionInput['fetch']
): AcquisitionInput {
	return {
		cacheDir,
		baseUrl: 'https://data.invalid/pinned',
		checksums: { 'Synthetic.csv': expectedChecksum },
		fetch: fetchInput
	};
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) =>
			rm(directory, { recursive: true, force: true })
		)
	);
});

describe('CSV acquisition', () => {
	it('parses a BOM, CRLF records, and RFC quoted fields', () => {
		const bytes = Buffer.from(
			'\uFEFFplayerID,displayName,comment\r\nanon001,"Player, One","line one\nline two"\r\n',
			'utf8'
		);

		expect(parseCsv('Synthetic.csv', bytes)).toEqual([
			{
				playerID: 'anon001',
				displayName: 'Player, One',
				comment: 'line one\nline two'
			}
		]);
	});

	it('rejects downloaded bytes that do not match the pinned checksum', async () => {
		const cacheDir = await temporaryDirectory();
		const bytes = Buffer.from('playerID,value\nanon001,1\n');
		const wrongChecksum = '0'.repeat(64);
		const input = inputFor(cacheDir, wrongChecksum, async () => successfulResponse(bytes));

		await expect(acquireTablesFrom(input)).rejects.toThrow(
			/Checksum mismatch for Synthetic\.csv/
		);
		await expect(readFile(join(cacheDir, 'Synthetic.csv'))).rejects.toMatchObject({
			code: 'ENOENT'
		});
	});

	it('uses verified cached bytes without making a network request', async () => {
		const cacheDir = await temporaryDirectory();
		const bytes = Buffer.from('playerID,value\nanon001,7\n');
		await mkdir(cacheDir, { recursive: true });
		await writeFile(join(cacheDir, 'Synthetic.csv'), bytes);
		let fetchCount = 0;
		const input = inputFor(cacheDir, checksum(bytes), async () => {
			fetchCount += 1;
			throw new Error('network access was not expected');
		});

		const tables = await acquireTablesFrom(input);

		expect(fetchCount).toBe(0);
		expect(tables).toEqual({ Synthetic: [{ playerID: 'anon001', value: '7' }] });
	});

	it('replaces a corrupt cache entry only after verifying its download', async () => {
		const cacheDir = await temporaryDirectory();
		const corrupt = Buffer.from('playerID,value\nanon001,corrupt\n');
		const replacement = Buffer.from('playerID,value\nanon001,verified\n');
		await mkdir(cacheDir, { recursive: true });
		await writeFile(join(cacheDir, 'Synthetic.csv'), corrupt);
		let requestedUrl = '';
		const input = inputFor(cacheDir, checksum(replacement), async (url) => {
			requestedUrl = url;
			return successfulResponse(replacement);
		});

		const tables = await acquireTablesFrom(input);

		expect(requestedUrl).toBe('https://data.invalid/pinned/Synthetic.csv');
		expect(tables.Synthetic).toEqual([{ playerID: 'anon001', value: 'verified' }]);
		await expect(readFile(join(cacheDir, 'Synthetic.csv'))).resolves.toEqual(replacement);
	});

	it('fails offline when the cached bytes are not verified', async () => {
		const cacheDir = await temporaryDirectory();
		const corrupt = Buffer.from('playerID,value\nanon001,corrupt\n');
		const expected = Buffer.from('playerID,value\nanon001,verified\n');
		await mkdir(cacheDir, { recursive: true });
		await writeFile(join(cacheDir, 'Synthetic.csv'), corrupt);
		let fetchCount = 0;
		const input = inputFor(cacheDir, checksum(expected), async () => {
			fetchCount += 1;
			return successfulResponse(expected);
		});

		await expect(acquireTablesFrom(input, true)).rejects.toThrow(
			/Offline acquisition requires a verified cache entry for Synthetic\.csv/
		);
		expect(fetchCount).toBe(0);
		await expect(readFile(join(cacheDir, 'Synthetic.csv'))).resolves.toEqual(corrupt);
	});
});

it('publishes a readable complete archive through a relative output path', async () => {
	const directory = await temporaryDirectory();
	const attribution: Attribution = {
		title: 'Synthetic source', credit: 'Synthetic contributors', sourceUrl: 'https://data.invalid',
		license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
		sourceCommit: 'synthetic', changes: 'Grouped synthetic records.', fullNotice: 'Synthetic licence notice.'
	};
	const payload = { profiles: [{ playerId: 'anon001', value: 7 }], sourceCommit: 'synthetic' };
	await writeArchive(relative(process.cwd(), directory), payload, attribution);
	const { stdout } = await promisify(execFile)('tar', ['-xOf', join(directory, 'transformed-data.tar.gz'), 'transformed-data.json']);
	expect(JSON.parse(stdout)).toEqual(payload);
	const notice = await promisify(execFile)('tar', ['-xOf', join(directory, 'transformed-data.tar.gz'), 'LICENSE.txt']);
	expect(notice.stdout).toBe(attribution.fullNotice);
});
