import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Attribution } from '../../src/lib/game/types.ts';
import { SOURCE_COMMIT } from './acquire.ts';

const OFFICIAL_NOTICE_URL =
	'https://sabr.box.com/shared/static/qtgh1olzcaauz5x234wqx8huixizff8l.txt';
const SOURCE_URL = 'https://sabr.org/lahman-database/';
const LICENSE_URL = 'https://creativecommons.org/licenses/by-sa/3.0/';
const NOTICE_CACHE_FILENAME = 'lahman-data-dictionary-license.txt';
const execFileAsync = promisify(execFile);

function isMissingFile(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		error.code === 'ENOENT'
	);
}

function validateOfficialNotice(text: string): string {
	const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
	if (
		!normalized.includes('Copyright Notice & Limited Use License') ||
		!normalized.includes('Creative Commons Attribution-ShareAlike 3.0') ||
		!normalized.includes('Data Tables')
	) {
		throw new Error('The official data dictionary response did not contain the expected licence notice');
	}
	return `${normalized}\n`;
}

async function readCachedNotice(path: string): Promise<string | null> {
	try {
		return validateOfficialNotice(await readFile(path, 'utf8'));
	} catch (error) {
		if (isMissingFile(error)) return null;
		if (error instanceof Error && error.message.startsWith('The official data dictionary')) {
			return null;
		}
		throw error;
	}
}

async function cacheNotice(path: string, notice: string): Promise<void> {
	const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
	await writeFile(temporaryPath, notice, 'utf8');
	try {
		await rename(temporaryPath, path);
	} catch (error) {
		await rm(temporaryPath, { force: true }).catch(() => undefined);
		throw error;
	}
}

async function loadOfficialNotice(offline: boolean): Promise<string> {
	const cacheDir = join(process.cwd(), '.cache', 'lahman');
	const cachePath = join(cacheDir, NOTICE_CACHE_FILENAME);
	const cached = await readCachedNotice(cachePath);
	if (cached !== null) return cached;
	if (offline) {
		throw new Error(
			`Offline attribution acquisition requires a valid cached official notice at ${cachePath}`
		);
	}

	let response: Response;
	try {
		response = await fetch(OFFICIAL_NOTICE_URL);
	} catch (error) {
		throw new Error(`Unable to download the official data dictionary from ${OFFICIAL_NOTICE_URL}`, {
			cause: error
		});
	}
	if (!response.ok) {
		throw new Error(
			`Unable to download the official data dictionary from ${OFFICIAL_NOTICE_URL}: HTTP ${response.status} ${response.statusText}`
		);
	}

	const notice = validateOfficialNotice(await response.text());
	await mkdir(cacheDir, { recursive: true });
	await cacheNotice(cachePath, notice);
	return notice;
}

export async function acquireAttribution(offline = false): Promise<Attribution> {
	const fullNotice = await loadOfficialNotice(offline);
	const titleEnd = fullNotice.indexOf('\n');
	const title = titleEnd === -1 ? fullNotice.trim() : fullNotice.slice(0, titleEnd);
	return {
		title,
		credit: 'Copyright holder and contributors listed in the full source notice',
		sourceUrl: SOURCE_URL,
		license: 'Creative Commons Attribution-ShareAlike 3.0 Unported',
		licenseUrl: LICENSE_URL,
		sourceCommit: SOURCE_COMMIT,
		changes:
			'Filtered the source to 1950–2025 American and National League records in current franchise histories; grouped team-season stints; joined batting, pitching, appearances, and fielding records; compiled relief-dominant team-season bullpen remainders; discarded unused biographical fields; prepared common-environment event rates; and repackaged the transformed profiles and 2025 opposition data for browser simulation.',
		fullNotice
	};
}

function sourceNotice(attribution: Attribution): string {
	return [
		attribution.title,
		'',
		`Credit: ${attribution.credit}`,
		`Source: ${attribution.sourceUrl}`,
		`Immutable CSV transport: https://github.com/corbtastik/lahman-baseball-db/commit/${attribution.sourceCommit}`,
		`Source transport revision: ${attribution.sourceCommit}`,
		`Licence: ${attribution.license}`,
		`Licence URL: ${attribution.licenseUrl}`,
		''
	].join('\n');
}

export async function writeArchive(
	dir: string,
	payload: Record<string, unknown>,
	attribution: Attribution
): Promise<void> {
	dir = resolve(dir);
	await mkdir(dir, { recursive: true });
	const stagingDir = await mkdtemp(join(dir, '.transformed-data-'));
	const archivePath = join(dir, 'transformed-data.tar.gz');
	const temporaryArchivePath = `${archivePath}.${process.pid}.${randomUUID()}.tmp`;

	try {
		await Promise.all([
			writeFile(
				join(stagingDir, 'README.txt'),
				[
					'Transformed 162-0 historical baseball data',
					'',
					'The complete machine-readable transformed payload is in transformed-data.json.',
					'SOURCE.txt identifies the source and pinned transport revision.',
					'LICENSE.txt contains the official source documentation and licence notice.',
					'CHANGES.txt describes the transformations applied by this project.',
					''
				].join('\n'),
				'utf8'
			),
			writeFile(join(stagingDir, 'SOURCE.txt'), sourceNotice(attribution), 'utf8'),
			writeFile(join(stagingDir, 'LICENSE.txt'), attribution.fullNotice, 'utf8'),
			writeFile(join(stagingDir, 'CHANGES.txt'), `${attribution.changes.trim()}\n`, 'utf8'),
			writeFile(
				join(stagingDir, 'ATTRIBUTION.json'),
				`${JSON.stringify(attribution, null, 2)}\n`,
				'utf8'
			),
			writeFile(
				join(stagingDir, 'transformed-data.json'),
				`${JSON.stringify(payload, null, 2)}\n`,
				'utf8'
			)
		]);

		const files = [
			'README.txt',
			'SOURCE.txt',
			'LICENSE.txt',
			'CHANGES.txt',
			'ATTRIBUTION.json',
			'transformed-data.json'
		];
		const ownershipArguments =
			process.platform === 'darwin'
				? ['--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'root']
				: ['--owner=0', '--group=0', '--numeric-owner'];
		try {
			await execFileAsync(
				'tar',
				['-czf', temporaryArchivePath, ...ownershipArguments, ...files],
				{ cwd: stagingDir, env: { ...process.env, COPYFILE_DISABLE: '1' } }
			);
		} catch (error) {
			throw new Error('Unable to create transformed-data.tar.gz with the system tar binary', {
				cause: error
			});
		}
		await rename(temporaryArchivePath, archivePath);
	} finally {
		await Promise.all([
			rm(stagingDir, { recursive: true, force: true }),
			rm(temporaryArchivePath, { force: true })
		]);
	}
}
