import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalJSON } from './data/compile.ts';
import { digest, fetchCachedBytes } from './media/cache.ts';
import { isReusableLicense, parseCaptureYear } from './media/logic.ts';
import { candidateRelevance, isLegacyCandidate, readResearch, recordAcquisition, researchContext } from './media/research.ts';
import type { PhotoCandidate } from './media/research.ts';
import type { CommonsMetadata } from './media/types.ts';
import { existsSync } from 'node:fs';
import { acquireCommonsReviewEvidence } from './media/providers.ts';

// This command prepares evidence for inspection; it never writes approval decisions.
const args = process.argv.slice(2);
if (args.some(arg => !/^(?:--(?:offline|all|legacy-only|evidence-only)|--(?:limit|offset|per-player|players|batch)=.+)$/.test(arg))) throw new Error('Usage: review-media.ts [--offline] [--all] [--legacy-only] [--evidence-only] [--limit=N] [--offset=N] [--per-player=N] [--players=id,id] [--batch=name]');
const option = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const limit = Number(option('limit') ?? 100), offset = Number(option('offset') ?? 0), perPlayer = Number(option('per-player') ?? 2);
if (![limit, offset, perPlayer].every(Number.isSafeInteger) || limit < 1 || offset < 0 || perPlayer < 1) throw new Error('Invalid review batch bounds');
const batch = option('batch') ?? `batch-${offset}`;
if (!/^[a-z0-9-]+$/.test(batch)) throw new Error('Invalid batch name');
const context = await researchContext(process.cwd());
const directory = join(context.cacheDir, 'review', batch);
await mkdir(directory, { recursive: true });
async function saveEvidence(items: Array<{ sourceId: string; metadata: CommonsMetadata }>): Promise<void> {
	const ids = items.filter(item => item.sourceId.startsWith('commons:')).map(item => item.metadata.pageId);
	const evidence = await acquireCommonsReviewEvidence(context.cacheDir, ids, args.includes('--offline'));
	await writeFile(join(directory, 'evidence.json'), `${canonicalJSON(evidence)}\n`);
}
if (args.includes('--evidence-only')) {
	await saveEvidence(JSON.parse(await readFile(join(directory, 'queue.json'), 'utf8')).prepared);
	console.log(`[review] Source revisions saved in ${directory}; no approvals written`);
	process.exit(0);
}
const explicit = option('players')?.split(',');
const reviewed = new Set(context.reviews.map(review => `${review.playerId}\0${review.sourceId}`));
const frequency = new Map<string, number>();
for (const candidate of context.data.candidates) if (!candidate.eligibleSlots?.includes('BP')) frequency.set(candidate.playerId, (frequency.get(candidate.playerId) ?? 0) + 1);
const identities = context.identities.filter(identity => explicit ? explicit.includes(identity.playerId) : args.includes('--all') || args.includes('--legacy-only') || !context.media.players[identity.playerId]?.photos.length)
	.sort((a, b) => (frequency.get(b.playerId) ?? 0) - (frequency.get(a.playerId) ?? 0) || a.playerId.localeCompare(b.playerId));
const queue: Array<{ playerId: string; name: string; firstYear: number; lastYear: number; sourceId: string; metadata: CommonsMetadata; relevance: number }> = [];
for (const identity of identities) {
	const record = await readResearch(context, identity);
	const aliases = context.aliases.get(identity.playerId) ?? [identity.name];
	const score = (candidate: PhotoCandidate) => {
		const metadata = candidate.metadata!;
		const year = parseCaptureYear(metadata.dateOriginal);
		const career = year !== null && year >= identity.firstYear && year <= identity.lastYear;
		return candidateRelevance(candidate, identity, aliases) * 100 + Number(career) * 20 + Number(metadata.height >= metadata.width) * 2;
	};
	const candidates = record.candidates.filter(candidate => candidate.metadata && isReusableLicense(candidate.metadata.license)
		&& (!args.includes('--legacy-only') || isLegacyCandidate(candidate, context.media.players[identity.playerId]?.photos ?? []))
		&& /^image\/(?:jpeg|png|tiff|webp)$/.test(candidate.metadata.mime) && !reviewed.has(`${identity.playerId}\0${candidate.sourceId}`))
		.sort((a, b) => score(b) - score(a) || a.sourceId.localeCompare(b.sourceId)).slice(0, perPlayer);
	for (const candidate of candidates) queue.push({ playerId: identity.playerId, name: identity.name, firstYear: identity.firstYear, lastYear: identity.lastYear, sourceId: candidate.sourceId, metadata: candidate.metadata!, relevance: candidateRelevance(candidate, identity, aliases) });
}
// Weak name-only matches follow all contextual leads. Within each group retain
// the player order by selectable cards restored, then each player's source order.
queue.sort((a, b) => Number(b.relevance >= 2) - Number(a.relevance >= 2));
const selected = queue.slice(offset, offset + limit);
const prepared: Array<(typeof selected)[number] & { index: number; sourceChecksum: string; imagePath: string }> = [];
const failures: Array<{ playerId: string; sourceId: string; error: string }> = [];
const exec = promisify(execFile);
const fonts = ['/System/Library/Fonts/Helvetica.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'];
const font = process.env.MEDIA_REVIEW_FONT ?? fonts.find(path => existsSync(path));
if (!font) throw new Error('Set MEDIA_REVIEW_FONT to an installed TrueType font for contact sheets');
for (const [index, item] of selected.entries()) {
	try {
		const bytes = await fetchCachedBytes(context.cacheDir, item.metadata.downloadUrl, args.includes('--offline'));
		const imagePath = join(directory, `${index}.jpg`);
		const input = join(context.cacheDir, 'downloads', `${digest(item.metadata.downloadUrl)}.bin`);
		await exec('magick', [input, '-auto-orient', '-thumbnail', '210x210>', '-background', 'white', '-gravity', 'center', '-extent', '220x220', imagePath], { timeout: 30_000 });
		prepared.push({ ...item, index, sourceChecksum: digest(bytes), imagePath });
		await recordAcquisition(context.cacheDir, { playerId: item.playerId, sourceId: item.sourceId, status: 'acquired', updatedAt: new Date().toISOString() });
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		failures.push({ playerId: item.playerId, sourceId: item.sourceId, error: reason });
		await recordAcquisition(context.cacheDir, { playerId: item.playerId, sourceId: item.sourceId, status: 'failed', reason, updatedAt: new Date().toISOString() });
	}
	if ((index + 1) % 10 === 0) console.log(`[review] ${index + 1}/${selected.length}, ${failures.length} unavailable`);
}
await writeFile(join(directory, 'queue.json'), `${canonicalJSON({ totalCandidates: queue.length, offset, prepared, failures })}\n`);
await saveEvidence(prepared);
for (let start = 0; start < prepared.length; start += 20) {
	const page = prepared.slice(start, start + 20);
	const inputs = page.flatMap(item => ['-label', `${item.index} ${item.name}\n${item.sourceId}\n${item.relevance >= 2 ? 'Context lead · unverified' : 'Name-only · unverified'}`, item.imagePath]);
	const output = join(directory, `sheet-${Math.floor(start / 20)}.jpg`);
	await exec('magick', ['montage', '-font', font, '-pointsize', '14', ...inputs, '-tile', '5x4', '-geometry', '220x260+4+4', '-background', 'white', output], { timeout: 60_000, maxBuffer: 1024 * 1024 });
	await exec('magick', ['-background', 'white', '-fill', 'black', '-font', font, '-pointsize', '20', '-size', '1140x90', '-gravity', 'center', 'caption:UNREVIEWED SEARCH CANDIDATES\nIdentity, uniform and photographic rights still require verification.', output, '-append', output], { timeout: 30_000 });
}
console.log(`[review] ${prepared.length} previews and ${failures.length} failures in ${directory}; no approvals written`);
