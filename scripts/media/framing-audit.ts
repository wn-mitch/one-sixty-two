import { mkdir, readFile, writeFile, copyFile, readdir, symlink, statfs, appendFile, link, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { createCardViewModel, type CardViewModel } from '../../src/lib/cards/view-model.ts';
import { FIN } from '../../src/lib/cards/finish.ts';
import { selectPhoto, selectTeamPhoto } from '../../src/lib/media/client.ts';
import type { Manifest, Profile, RosterSlot, SimulationData } from '../../src/lib/game/types.ts';
import type { MediaManifest } from '../../src/lib/media/types.ts';
import type { PhotoFramingRegistry } from '../../src/lib/media/types.ts';
import { applyPhotoFraming, validateFramingRegistry } from '../../src/lib/media/framing.ts';
import type { WarRankings } from '../../src/lib/rankings/types.ts';
import { atomicWrite } from './cache.ts';
import { capturePhotoPixels, checksum, type PixelEvidence } from './framing-pixels.ts';

/** Full-front capture using production selection/layouts. Run inventory before captures:
 * node scripts/media/framing-audit.ts inventory
 * node scripts/media/framing-audit.ts baseline http://127.0.0.1:5173 --representatives
 * node scripts/media/framing-audit.ts baseline http://127.0.0.1:5173
 */
const run = promisify(execFile);
const root = process.cwd();
const out = join(root, '.cache/media/framing');
const command = process.argv[2] ?? 'inventory';
const base = process.argv[3] ?? 'http://127.0.0.1:5173';
const representativesOnly = process.argv.includes('--representatives');
const filter = process.argv.find(value => value.startsWith('--filter='))?.slice(9).toLowerCase();
const sourceFilter = process.argv.find(value => value.startsWith('--sources='))?.slice(10).split(',');
const idFilter = process.argv.find(value => value.startsWith('--ids='))?.slice(6).split(',');
const registryPath = process.argv.find(value => value.startsWith('--registry='))?.slice(11) ?? join(root, 'scripts/media/photo-framing.json');
const start = Number(process.argv.find(value => value.startsWith('--start='))?.slice(8) ?? 0);
const width = Number(process.argv.find(value => value.startsWith('--width='))?.slice(8) ?? 240);
const decorated = process.argv.includes('--decorated');
const pixelCheck = process.argv.includes('--pixel-evidence');
if (!Number.isInteger(width) || width < 100 || width > 500 || width % 5) throw new Error('Width must be a multiple of five between 100 and 500');
const limitArg = process.argv.find(value => value.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
if (!(limit > 0)) throw new Error('--limit must be a positive number');
const read = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;
const asset = (url: string) => join(root, 'static', url);
const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 20);
const dataPointer = await read<{ manifestUrl: string }>(asset('/data/current.json'));
const mediaPointer = await read<{ manifestUrl: string }>(asset('/media/current.json'));
const rankingPointer = await read<{ manifestUrl: string }>(asset('/rankings/current.json'));
const [manifest, media, rankings] = await Promise.all([
	read<Manifest>(asset(dataPointer.manifestUrl)), read<MediaManifest>(asset(mediaPointer.manifestUrl)), read<WarRankings>(asset(rankingPointer.manifestUrl))
]);
const registry = await read<PhotoFramingRegistry>(registryPath);
validateFramingRegistry(registry);
for (const photo of [...Object.values(media.players).flatMap(player => player.photos), ...Object.values(media.teams).flatMap(team => team.photos ?? [])]) {
	delete photo.framing;
	if (command === 'after') applyPhotoFraming(photo, registry);
}
const profiles = new Map<string, Profile>();
for (const url of Object.values(manifest.chunks)) for (const profile of await read<Profile[]>(asset(url))) profiles.set(profile.seasonId, profile);
const simulation = await read<SimulationData>(asset(manifest.simulationUrl));
for (const opponent of simulation.opponents) for (const profile of [...opponent.hitters, ...opponent.starters, opponent.closer, ...opponent.relievers, opponent.bullpen]) profiles.set(profile.seasonId, profile);
interface Entry {
	id: string; seasonId: string; slot: RosterSlot | null; name: string; era: string; photo: string; sourceId: string; sourceChecksum: string;
	group: string; representative: string; renderFingerprint: string; renderRepresentative: string; review: string; subject: 'player' | 'team';
}
const entries: Entry[] = [];
const groups = new Map<string, Entry>();
const renders = new Map<string, Entry>();
for (const profile of profiles.values()) {
	const team = !!profile.bullpen || profile.playerId === `${profile.franchiseId}:bullpen`;
	const photo = team ? selectTeamPhoto(media, profile.franchiseId, profile.year) : selectPhoto(media, profile.playerId, profile.year, profile.franchiseId);
	if (!photo) continue;
	for (const slot of [null, ...profile.eligibleSlots] as Array<RosterSlot | null>) {
		const card = createCardViewModel({ profile, slot, manifest, media, rankings });
		const group = hash(JSON.stringify([photo.url, card.era, card.cardRole, card.logoShape]));
		const id = hash(`${profile.seasonId}|${slot ?? 'default'}`);
		const { b: _back, details: _details, ...front } = card;
		const renderFingerprint = hash(JSON.stringify({ ...front, fin: decorated ? card.fin : FIN.base }));
		const entry: Entry = { id, seasonId: profile.seasonId, slot, name: card.full, era: card.era, photo: photo.url,
			sourceId: photo.sourceId ?? photo.sourceUrl, sourceChecksum: photo.sourceChecksum ?? photo.evidence?.sourceChecksum ?? '',
			group, representative: groups.get(group)?.id ?? id, renderFingerprint, renderRepresentative: renders.get(renderFingerprint)?.id ?? id, review: 'pending', subject: team ? 'team' : 'player' };
		entries.push(entry);
		if (!groups.has(group)) groups.set(group, entry);
		if (!renders.has(renderFingerprint)) renders.set(renderFingerprint, entry);
	}
}
await mkdir(out, { recursive: true });
const summary = { profiles: profiles.size, photoCards: entries.length, photos: new Set(entries.map(entry => entry.photo)).size,
	framingGroups: groups.size, uniqueFullFronts: renders.size, dataVersion: manifest.dataVersion, mediaVersion: media.version };
// The common inventory describes identities; phase-specific render fingerprints live with each capture.
if (command === 'inventory' || command === 'baseline') await atomicWrite(join(out, 'inventory.json'), JSON.stringify({ ...summary, entries }));
console.log(JSON.stringify(summary));
if (command === 'inventory') process.exit(0);
if (!['baseline', 'after'].includes(command)) throw new Error('Expected inventory, baseline, or after');
const phaseName = process.argv.find(value => value.startsWith('--phase='))?.slice(8);
if (phaseName && !/^[a-z0-9-]+$/.test(phaseName)) throw new Error('Phase must contain only lowercase letters, numbers and hyphens');
const phase = join(out, phaseName ?? `${command}${decorated ? '-decorated' : ''}${width === 240 ? '' : `-${width}`}`);
await mkdir(join(phase, 'cards'), { recursive: true });
await atomicWrite(join(phase, 'inventory.json'), JSON.stringify({ ...summary, entries }));
await mkdir(join(out, 'sources'), { recursive: true });
for (const photo of new Set(entries.map(entry => entry.photo))) await symlink(asset(photo), join(out, 'sources', `${hash(photo)}.webp`)).catch(error => { if (error.code !== 'EEXIST') throw error; });
const requested = (representativesOnly ? [...groups.values()] : entries).filter(entry => (!filter || `${entry.name} ${entry.seasonId}`.toLowerCase().includes(filter)) && (!sourceFilter || sourceFilter.includes(entry.sourceId)) && (!idFilter || idFilter.includes(entry.id))).slice(start, start + limit);
const aliases = new Map<string, Entry[]>();
for (const entry of requested) aliases.set(entry.renderFingerprint, [...(aliases.get(entry.renderFingerprint) ?? []), entry]);
const selected = [...aliases.values()].map(items => items[0]);
await atomicWrite(join(phase, 'selected.json'), JSON.stringify(requested, null, 2));
const rendererFiles = (await Promise.all(['src/lib/cards', 'src/lib/media', 'src/routes/card-audit'].map(async directory =>
	(await readdir(join(root, directory), { recursive: true })).filter(file => /\.(ts|svelte|json)$/.test(file)).map(file => join(directory, file))))).flat().sort();
const rendererChecksum = hash((await Promise.all(rendererFiles.map(async file => `${file}\0${await readFile(join(root, file), 'utf8')}`))).join('\0'));
await appendFile(join(phase, 'runs.jsonl'), JSON.stringify({ startedAt: new Date().toISOString(), dataVersion: manifest.dataVersion, mediaVersion: media.version,
	registryChecksum: command === 'after' ? hash(JSON.stringify(registry)) : null, rendererChecksum, width, decorated, filter, representativesOnly, expected: selected.length }) + '\n');
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const failures: Array<{ ids: string[]; error: string }> = [];
const geometry = await read<Record<string, unknown>>(join(phase, 'geometry.json')).catch(() => ({}));
const valid = await read<Record<string, { rendererChecksum: string; fingerprint: string }>>(join(phase, 'valid-captures.json')).catch(() => ({}));
const existing = new Set(await readdir(join(phase, 'cards')));
const evidence = pixelCheck ? await read<Record<string, PixelEvidence>>(join(phase, 'pixel-evidence.json')).catch(() => ({})) : {};
let captured = 0;
try {
	browser = await chromium.launch({ headless: true, args: ['--mute-audio'] });
	const page = await browser.newPage({ viewport: { width: width * 8, height: width * 1.4 * 8 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
	// Freeze this capture page's module graph once loaded; other workspaces cannot push HMR edits into it.
	await page.routeWebSocket('**/*', socket => socket.close());
	await page.goto(new URL('/card-audit', base).href);
	await page.waitForFunction(() => typeof (window as unknown as { renderAudit: unknown }).renderAudit === 'function');
	await page.addStyleTag({ content: '[data-feedback-tools], [data-feedback-dial-host], agentation-toolbar, [data-agentation-root], [data-feedback-toolbar] { display: none !important; }' });
	for (let offset = 0; offset < selected.length; offset += 64) {
		const batch = selected.slice(offset, offset + 64);
		if (!process.argv.includes('--force') && batch.every(entry => aliases.get(entry.renderFingerprint)!.every(alias => existing.has(`${alias.id}.jpg`) && (!pixelCheck || evidence[alias.id]?.version === 2) && valid[alias.id]?.rendererChecksum === rendererChecksum && valid[alias.id]?.fingerprint === alias.renderFingerprint))) {
			captured += batch.reduce((count, entry) => count + aliases.get(entry.renderFingerprint)!.length, 0);
			continue;
		}
		const disk = await statfs(out);
		if (disk.bavail * disk.bsize < 50 * 1024 ** 3) {
			failures.push({ ids: selected.slice(offset).map(entry => entry.id), error: 'Stopped: free space below 50 GiB disk guard threshold' });
			break;
		}
		try {
			if (await page.locator('vite-error-overlay').count()) throw new Error('Vite error overlay present: capture rejected');
			const cards = batch.map(entry => { const card = createCardViewModel({ profile: profiles.get(entry.seasonId)!, slot: entry.slot, manifest, media, rankings }); return decorated ? card : { ...card, fin: FIN.base }; });
			await page.evaluate(async ({cards, width, decorated}) => {
				await (window as unknown as { renderAudit: (cards: CardViewModel[], size: number, decorated: boolean) => Promise<void> }).renderAudit(cards, width, decorated);
			}, {cards, width, decorated});
			const boxes = await page.locator('[data-audit-grid] .tile').evaluateAll(tiles => tiles.map(tile => {
				const photo = tile.querySelector<HTMLImageElement>('[data-layer="photo.image"]');
				const outer = tile.getBoundingClientRect(), rect = photo?.getBoundingClientRect();
				return { photo: rect ? { x: rect.x - outer.x, y: rect.y - outer.y, width: rect.width, height: rect.height } : null,
					naturalWidth: photo?.naturalWidth, naturalHeight: photo?.naturalHeight, objectFit: photo && getComputedStyle(photo).objectFit, objectPosition: photo && getComputedStyle(photo).objectPosition,
					stickers: tile.querySelectorAll('.stickers .spot').length };
			}));
			batch.forEach((entry, index) => { geometry[entry.id] = boxes[index]; });
			const sheet = join(phase, 'batch.png');
			if (await page.locator('vite-error-overlay').count()) throw new Error('Vite error overlay present: capture rejected');
			await page.locator('[data-audit-grid]').screenshot({ path: sheet, animations: 'disabled' });
			const pixels = pixelCheck ? await capturePhotoPixels(page, width, join(phase, 'batch-pixels.png')) : undefined;
			await run('magick', [sheet, '-crop', `${width}x${width * 1.4}`, '+repage', '-quality', '82', join(phase, 'tile-%02d.jpg')]);
			for (const [index, entry] of batch.entries()) {
				const tile = join(phase, `tile-${String(index).padStart(2, '0')}.jpg`), target = join(phase, 'cards', `${entry.id}.jpg`);
				await unlink(target).catch(error => { if (error.code !== 'ENOENT') throw error; });
				const before = join(out, 'baseline/cards', `${entry.id}.jpg`);
				const identical = command === 'after' && !decorated && width === 240 && await readFile(before).then(async bytes => bytes.equals(await readFile(tile)), () => false);
				if (identical) await link(before, target); else await copyFile(tile, target);
				if (pixels) evidence[entry.id] = { version: 2, ...pixels[index], jpegChecksum: checksum(await readFile(tile)), baselineIdentical: identical };
				for (const alias of aliases.get(entry.renderFingerprint)!.slice(1)) {
					const path = join(phase, 'cards', `${alias.id}.jpg`);
					await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
					await link(target, path);
					geometry[alias.id] = boxes[index];
					if (pixels) evidence[alias.id] = { ...evidence[entry.id], baselineIdentical: command === 'after' && !decorated && width === 240 && await readFile(join(out, 'baseline/cards', `${alias.id}.jpg`)).then(bytes => checksum(bytes) === evidence[entry.id].jpegChecksum, () => false) };
				}
			}
			const contact = `contact-${filter?.replace(/[^a-z0-9]/g, '-') ?? (sourceFilter ? `sources-${hash(sourceFilter.join(','))}` : idFilter ? `ids-${hash(idFilter.join(','))}` : 'all')}-${String(offset + start).padStart(6, '0')}`;
			if (representativesOnly || filter || sourceFilter) {
				await run('magick', [sheet, '-resize', '1600x', '-quality', '80', join(phase, `${contact}.jpg`)]);
				await atomicWrite(join(phase, `${contact}.json`), JSON.stringify(batch.map((entry, index) => ({ index, ...entry })), null, 2));
			}
			captured += batch.reduce((count, entry) => count + aliases.get(entry.renderFingerprint)!.length, 0);
			for (const entry of batch) for (const alias of aliases.get(entry.renderFingerprint)!) valid[alias.id] = { rendererChecksum, fingerprint: entry.renderFingerprint };
		} catch (error) {
			failures.push({ ids: batch.map(entry => entry.id), error: String(error) });
			if (page.isClosed() || !browser.isConnected()) break;
		}
		await atomicWrite(join(phase, 'geometry.json'), JSON.stringify(geometry));
		await atomicWrite(join(phase, 'valid-captures.json'), JSON.stringify(valid));
		if (pixelCheck && offset % 640 === 0) await atomicWrite(join(phase, 'pixel-evidence.json'), JSON.stringify(evidence));
		await atomicWrite(join(phase, 'capture-status.json'), JSON.stringify({ expected: requested.length, uniqueRenders: selected.length, captured, failures }, null, 2));
		if (offset % 640 === 0) console.log(`${command}: ${captured}/${requested.length}; failed batches ${failures.length}`);
	}
} catch (error) {
	failures.push({ ids: requested.filter(entry => !existing.has(`${entry.id}.jpg`) || valid[entry.id]?.rendererChecksum !== rendererChecksum || valid[entry.id]?.fingerprint !== entry.renderFingerprint).map(entry => entry.id), error: `Capture startup failed: ${String(error)}` });
} finally { await browser?.close(); }
await atomicWrite(join(phase, 'capture-status.json'), JSON.stringify({ expected: requested.length, uniqueRenders: selected.length, captured, failures }, null, 2));
await atomicWrite(join(phase, 'geometry.json'), JSON.stringify(geometry));
if (pixelCheck) await atomicWrite(join(phase, 'pixel-evidence.json'), JSON.stringify(evidence));
const completed = new Set(entries.filter(entry => valid[entry.id]?.rendererChecksum === rendererChecksum && valid[entry.id]?.fingerprint === entry.renderFingerprint).map(entry => entry.id));
await atomicWrite(join(phase, 'coverage.json'), JSON.stringify({ expected: entries.length, captured: entries.filter(entry => completed.has(entry.id)).length, pending: entries.filter(entry => !completed.has(entry.id)).length, failures }, null, 2));
const beforeIds = new Set(await readdir(join(out, 'baseline/cards')).catch(() => []));
const afterIds = new Set(await readdir(join(out, 'after/cards')).catch(() => []));
await writeFile(join(out, 'index.html'), gallery(entries.filter(entry => beforeIds.has(`${entry.id}.jpg`) || afterIds.has(`${entry.id}.jpg`))));
console.log(JSON.stringify({ captured, failedBatches: failures.length, failureReport: join(phase, 'capture-status.json') }));
if (failures.length) process.exitCode = 1;

function gallery(items: Entry[]): string {
	return `<!doctype html><meta charset="utf-8"><title>Card framing audit</title><style>body{background:#10161c;color:#eee;font:15px system-ui;margin:20px}input,select{font:inherit;padding:8px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(450px,1fr));gap:16px}article{background:#202a34;padding:12px}img{width:210px;height:294px;object-fit:contain}small{display:block;overflow-wrap:anywhere}</style><h1>Card framing audit</h1><p>${summary.photoCards} fronts; ${summary.photos} photos; ${summary.framingGroups} framing groups. Captures are quiet-finish fronts. Review remains pending until recorded by reviewers.</p><input id="search" placeholder="Name, season, era, source"><label><input id="representatives" type="checkbox" checked>Framing representatives</label><p id="count"></p><main></main><script>const entries=${JSON.stringify(items).replaceAll('<', '\\u003c')};const hashMap=${JSON.stringify(Object.fromEntries(items.map(entry => [entry.photo, hash(entry.photo)])))};let limit=80;const main=document.querySelector('main');function render(){const q=document.querySelector('#search').value.toLowerCase();const rows=entries.filter(e=>(!document.querySelector('#representatives').checked||e.id===e.representative)&&JSON.stringify(e).toLowerCase().includes(q));document.querySelector('#count').textContent=rows.length+' matches';main.replaceChildren();for(const e of rows.slice(0,limit)){const a=document.createElement('article');const h=document.createElement('h2');h.textContent=e.name+' · '+e.seasonId+' · '+(e.slot||'default');a.append(h);for(const src of ['baseline/cards/'+e.id+'.jpg','after/cards/'+e.id+'.jpg','sources/'+hashMap[e.photo]+'.webp']){const image=document.createElement('img');image.src=src;image.loading='lazy';a.append(image)}const s=document.createElement('small');s.textContent=e.era+' · '+e.sourceId+' · '+e.review;a.append(s);main.append(a)}}document.querySelector('#search').oninput=()=>{limit=80;render()};document.querySelector('#representatives').onchange=()=>{limit=80;render()};window.onscroll=()=>{if(innerHeight+scrollY>=document.body.scrollHeight-500){limit+=80;render()}};render();</script>`;
}
