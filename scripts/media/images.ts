import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { canonicalJSON } from '../data/compile.ts';
import { digest, fetchCachedBytes } from './cache.ts';
import type { CommonsMetadata, PreparedAsset } from './types.ts';

const execFileAsync = promisify(execFile);
const IMAGE_PIPELINE_VERSION = 'commons-thumb-webp-v2';

interface OptimizedMetadata {
	checksum: string;
	width: number;
	height: number;
	sourceChecksum: string;
}

async function readOptimized(
	path: string,
	metadataPath: string,
	sourceChecksum: string,
	maxDimension: number
): Promise<{ bytes: Buffer; width: number; height: number } | null> {
	try {
		const [bytes, metadataBytes] = await Promise.all([readFile(path), readFile(metadataPath)]);
		const metadata = JSON.parse(metadataBytes.toString('utf8')) as OptimizedMetadata;
		if (
			!Number.isInteger(metadata.width) ||
			!Number.isInteger(metadata.height) ||
			metadata.sourceChecksum !== sourceChecksum ||
			metadata.checksum !== digest(bytes) ||
			metadata.width < 1 ||
			metadata.height < 1 ||
			metadata.width > maxDimension ||
			metadata.height > maxDimension
		) return null;
		return { bytes, width: metadata.width, height: metadata.height };
	} catch {
		return null;
	}
}

export async function prepareImage(
	metadata: CommonsMetadata,
	cacheDir: string,
	assetDirectory: string,
	offline: boolean,
	maxDimension = 384
): Promise<PreparedAsset> {
	if (!Number.isInteger(maxDimension) || maxDimension < 1 || maxDimension > 4096) {
		throw new Error(`Invalid image maximum dimension: ${maxDimension}`);
	}
	const sourceBytes = await fetchCachedBytes(cacheDir, metadata.downloadUrl, offline);
	const sourceChecksum = digest(sourceBytes);
	const key = digest(`${IMAGE_PIPELINE_VERSION}\0${maxDimension}\0${metadata.downloadUrl}\0${sourceChecksum}`);
	const optimizedDirectory = join(cacheDir, 'optimized');
	const optimizedPath = join(optimizedDirectory, `${key}.webp`);
	const optimizedMetadataPath = join(optimizedDirectory, `${key}.json`);
	let optimized = await readOptimized(optimizedPath, optimizedMetadataPath, sourceChecksum, maxDimension);
	if (!optimized) {
		await mkdir(optimizedDirectory, { recursive: true });
		const temporaryInput = join(optimizedDirectory, `.${key}.${randomUUID()}.input`);
		const temporaryOutput = join(optimizedDirectory, `.${key}.${randomUUID()}.webp`);
		try {
			await writeFile(temporaryInput, sourceBytes);
			await execFileAsync('magick', [
				'-limit', 'memory', '256MiB',
				'-limit', 'map', '512MiB',
				'-limit', 'disk', '1GiB',
				temporaryInput,
				'-auto-orient',
				'-strip',
				'-thumbnail', `${maxDimension}x${maxDimension}>`,
				'-define', 'webp:method=6',
				'-quality', '82',
				temporaryOutput
			], { timeout: 60_000, maxBuffer: 1024 * 1024 });
			const { stdout } = await execFileAsync('magick', ['identify', '-format', '%w %h', temporaryOutput], { timeout: 10_000 });
			const [width, height] = stdout.trim().split(/\s+/).map(Number);
			if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > maxDimension || height > maxDimension) {
				throw new Error(`Image optimizer produced invalid dimensions for Commons page ${metadata.pageId}`);
			}
			const bytes = await readFile(temporaryOutput);
			const details: OptimizedMetadata = { checksum: digest(bytes), width, height, sourceChecksum };
			const temporaryMetadata = `${optimizedMetadataPath}.${randomUUID()}.tmp`;
			await rename(temporaryOutput, optimizedPath);
			await writeFile(temporaryMetadata, `${canonicalJSON(details)}\n`);
			await rename(temporaryMetadata, optimizedMetadataPath);
			optimized = { bytes, width, height };
		} catch (error) {
			throw new Error(`Unable to optimize Commons image page ${metadata.pageId}`, { cause: error });
		} finally {
			await Promise.all([
				rm(temporaryInput, { force: true }),
				rm(temporaryOutput, { force: true })
			]);
		}
	}
	if (!optimized) throw new Error(`Image optimizer did not produce output for Commons page ${metadata.pageId}`);
	const filename = `${digest(optimized.bytes)}.webp`;
	await mkdir(assetDirectory, { recursive: true });
	await copyFile(optimizedPath, join(assetDirectory, filename));
	return {
		filename,
		url: filename,
		width: optimized.width,
		height: optimized.height,
		sourceUrl: metadata.sourceUrl,
		license: metadata.license ?? '',
		licenseUrl: metadata.licenseUrl ?? '',
		credit: metadata.credit ?? ''
	};
}
