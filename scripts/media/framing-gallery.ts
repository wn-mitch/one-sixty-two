import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite } from './cache.ts';
import { loadReviews, derivative, reviewStatus, matchingReview, sourceInspected, type ReviewRow } from './framing-review-data.ts';
import { checksum } from './framing-pixels.ts';
import type { PhotoFramingRegistry } from '../../src/lib/media/types.ts';

/** Reconcile actual captures and explicit visual judgments; never infer a review from a group. */
const root = join(process.cwd(), '.cache/media/framing');
const afterPhase = process.argv[2] ?? 'after';
if (!/^[a-z0-9-]+$/.test(afterPhase)) throw new Error('Invalid capture phase');
type Row = Record<string, unknown> & { id: string; photo: string };
async function json<T>(path: string, fallback: T): Promise<T> {
	try { return JSON.parse(await readFile(join(root, path), 'utf8')) as T; }
	catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error; }
}
async function captures(phase: string): Promise<Set<string>> {
	const valid = await json<Record<string, unknown>>(`${phase}/valid-captures.json`, {});
	try { return new Set((await readdir(join(root, phase, 'cards'))).filter(name => name.endsWith('.jpg') && valid[name.slice(0, -4)]).map(name => name.slice(0, -4))); }
	catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set(); throw error; }
}
const inventory = await json<{ entries: Row[]; photoCards: number; mediaVersion: string }>('inventory.json', { entries: [], photoCards: 0, mediaVersion: '' });
if (!inventory.entries.length) throw new Error('Run the card framing inventory first');
const before = await captures('baseline'), after = await captures(afterPhase);
const pixelReview = await json<{ counts?: Record<string, unknown>; results: Array<{ id: string; verification: string; status: string; subtype?: string; anchor?: string; captureChecksum?: string; anchorCaptureChecksum?: string }> }>(`${afterPhase}/pixel-review.json`, { results: [] });
const pixelEvidence = await json<Record<string, { jpegChecksum: string; baselineIdentical?: boolean }>>(`${afterPhase}/pixel-evidence.json`, {});
const pixelRows = new Map(pixelReview.results.map(row => [row.id, row]));
const allReviews = await loadReviews(root);
const reviews = new Map<string, ReviewRow[]>();
const sources = new Map<string, ReviewRow>();
for (const row of allReviews) {
	reviews.set(row.id, [...(reviews.get(row.id) ?? []), row]);
	if (!row.photo || !sourceInspected(row)) continue;
	const key = derivative(row.photo), previous = sources.get(key);
	// Preserve measured coordinates when a later source-only judgment omits them.
	sources.set(key, { ...previous, ...row, subjectBounds: row.subjectBounds ?? previous?.subjectBounds, focalPoint: row.focalPoint ?? previous?.focalPoint });
}
const registry = JSON.parse(await readFile(join(process.cwd(), 'scripts/media/photo-framing.json'), 'utf8')) as PhotoFramingRegistry;
const registryByChecksum = new Map(registry.entries.map(row => [row.derivativeChecksum, row]));
// Registry coordinates describe the exact published derivative, never a source URL
// whose bytes may change. Loading these labels does not confer visual acceptance.
for (const [key, row] of sources) {
	const bytes = await readFile(join(process.cwd(), 'static', row.photo)).catch(() => null);
	const metadata = bytes && registryByChecksum.get(checksum(bytes));
	if (metadata) sources.set(key, { ...row, subtype: metadata.subtype, subjectBounds: metadata.subjectBounds, focalPoint: metadata.focalPoint });
}
const entries = inventory.entries.map(entry => {
	const pixel = pixelRows.get(entry.id), matched = pixel && pixel.verification !== 'pending-visual';
	const anchorId = matched ? pixel.anchor ?? entry.id : entry.id;
	const review = matched
		? matchingReview(reviews.get(anchorId) ?? [], entry.photo, pixel.anchorCaptureChecksum ?? pixelEvidence[anchorId]?.jpegChecksum ?? pixel.captureChecksum, pixelEvidence[anchorId]?.baselineIdentical ?? false)
		: [...(reviews.get(entry.id) ?? [])].reverse().find(row => derivative(row.photo ?? '') === derivative(entry.photo) && !row.captureChecksum && !String(row.reviewStage ?? '').includes('after'));
	const source = sources.get(derivative(entry.photo));
	const status = pixel ? pixel.status : review ? reviewStatus(review) : 'pending';
	return { ...entry, review: status, subtype: source?.subtype ?? (matched ? pixel.subtype : review?.subtype) ?? 'unclassified', finding: review?.finding ?? review?.note ?? '',
		stage: matched ? `${pixel.verification} · anchor ${pixel.anchor}` : review?.reviewStage ?? (review ? 'rendered baseline' : ''), before: before.has(entry.id), after: after.has(entry.id),
		pixelVerification: pixel?.verification, sourceCompared: !!source, sourceReviewFile: source?.reviewFile,
		annotatedCapture: review?.annotatedCapture,
		subjectBounds: source?.subjectBounds, focalPoint: source?.focalPoint, beforeCrop: review?.beforeCrop, afterCrop: review?.afterCrop };

});
const selectedDerivatives = new Set(inventory.entries.map(row => derivative(row.photo)));
const coreSubtypes = new Set(['tight-headshot', 'head-and-shoulders', 'upper-body-portrait', 'upper-body-action', 'full-body-portrait', 'full-body-action', 'team-group']);
const sourceSubtypeCounts = Object.fromEntries([...new Set([...selectedDerivatives].map(key => String(sources.get(key)?.subtype ?? 'unclassified')))].sort().map(subtype => [subtype, [...selectedDerivatives].filter(key => (sources.get(key)?.subtype ?? 'unclassified') === subtype).length]));
const sourceCoverage = {
	expected: selectedDerivatives.size,
	compared: [...selectedDerivatives].filter(key => sources.has(key)).length,
	classified: [...selectedDerivatives].filter(key => coreSubtypes.has(String(sources.get(key)?.subtype))).length,
	otherComposition: [...selectedDerivatives].filter(key => sources.get(key)?.subtype && sources.get(key)?.subtype !== 'unclassified' && !coreSubtypes.has(String(sources.get(key)?.subtype))).length,
	unclassified: sourceSubtypeCounts.unclassified ?? 0,
	subtypes: sourceSubtypeCounts,
	measured: [...selectedDerivatives].filter(key => sources.get(key)?.subjectBounds && sources.get(key)?.focalPoint).length
};
const registryByIdentity = new Map(registry.entries.map(row => [`${row.sourceId}:${row.derivativeChecksum}`, row]));
const selectedRegistry = new Set<string>(), changedRegistry = new Set<string>();
let selectedFrontsWithRegistry = 0, selectedFrontsWithChangedFit = 0;
for (const row of inventory.entries) {
	const key = `${row.sourceId}:${derivative(row.photo).replace(/\.webp$/, '')}`;
	const framing = registryByIdentity.get(key);
	if (!framing || (framing.sourceChecksum && framing.sourceChecksum !== row.sourceChecksum)) continue;
	selectedFrontsWithRegistry++;
	selectedRegistry.add(key);
	const fit = framing.eras?.[row.era as keyof NonNullable<typeof framing.eras>] ?? framing.fit;
	const team = row.subject === 'team';
	if (fit.mode !== (team ? 'contain' : 'cover') || fit.position.x !== 0.5 || fit.position.y !== (team ? 0.5 : 0.22) || fit.displayCrop) {
		selectedFrontsWithChangedFit++;
		changedRegistry.add(key);
	}
}
// Settings changes and visible pixel changes are separate counts: a centered
// square photo can render identically under different object-position values.
const framingSettings = {
	registryEntries: registry.entries.length,
	selectedRegistryEntries: selectedRegistry.size,
	selectedEntriesWithChangedFit: changedRegistry.size,
	selectedEntriesWithoutChangedFit: selectedRegistry.size - changedRegistry.size,
	selectedFrontsWithRegistry,
	selectedFrontsWithChangedFit,
	selectedFrontsWithUnchangedFit: selectedFrontsWithRegistry - selectedFrontsWithChangedFit
};
const counts = {
	sourceCoverage,
	framingSettings,
	// JPEG equality proves unchanged captures; unequal bytes alone do not establish
	// a visible framing change. Keep these distinct from effective fit settings.
	captureComparison: {
		byteIdenticalToBaseline: entries.filter(row => before.has(row.id) && after.has(row.id) && pixelEvidence[row.id]?.baselineIdentical === true).length,
		byteDifferentFromBaseline: entries.filter(row => before.has(row.id) && after.has(row.id) && pixelEvidence[row.id]?.baselineIdentical === false).length,
		uncompared: entries.filter(row => !before.has(row.id) || !after.has(row.id) || pixelEvidence[row.id]?.baselineIdentical === undefined).length
	},
	expected: entries.length,
	beforeCaptured: entries.filter(row => row.before).length,
	afterCaptured: entries.filter(row => row.after).length,
	reviewed: entries.filter(row => row.review !== 'pending').length,
	pixelEvidence: pixelReview.counts,
	statuses: Object.fromEntries([...new Set(entries.map(row => row.review))].map(status => [status, entries.filter(row => row.review === status).length]))
};
await atomicWrite(join(root, 'review-coverage.json'), `${JSON.stringify(counts, null, 2)}\n`);
// Only embed captured/reviewed rows; complete coverage remains in inventory.json.
const visible = entries.filter(row => row.before || row.after || row.review !== 'pending');
const data = JSON.stringify(visible).replaceAll('<', '\\u003c');
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Card framing review</title>
<style>
:root{color-scheme:dark;font-family:system-ui;background:#12191f;color:#e8eef2}body{margin:24px}h1{font-size:24px}p{max-width:80ch;line-height:1.5}
nav{display:flex;flex-wrap:wrap;gap:12px;position:sticky;top:0;background:#12191f;padding:12px 0;z-index:2}input,select,button{font:inherit;padding:10px;background:#24313b;color:inherit;border:1px solid #667b89;border-radius:4px}label{display:flex;gap:8px;align-items:center}
article{padding:24px 0;border-bottom:1px solid #465561}h2{font-size:18px;margin:0}small{display:block;margin:8px 0;overflow-wrap:anywhere}.images{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;width:240px}figure>a{display:block;position:relative}img{display:block;width:240px;height:auto}figcaption{margin:8px 0;color:#b4c6d2;font-size:13px}.missing{height:336px;display:grid;place-items:center;background:#202b34}svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.finding{margin:10px 0}a{color:#91d6ef}
</style>
<h1>Card framing review</h1>
<p>${counts.expected.toLocaleString('en-US')} full fronts inventoried; ${counts.beforeCaptured.toLocaleString('en-US')} before captures; ${counts.afterCaptured.toLocaleString('en-US')} after captures; ${counts.reviewed.toLocaleString('en-US')} review records or verified pixel matches. Exact photo-area matches inherit only a current, visually reviewed capture. Unmatched pixels remain pending for visual inspection.</p>
<p>${sourceCoverage.compared.toLocaleString('en-US')} of ${sourceCoverage.expected.toLocaleString('en-US')} source derivatives compared; ${sourceCoverage.classified.toLocaleString('en-US')} assigned one of the seven photo subtypes; ${sourceCoverage.otherComposition.toLocaleString('en-US')} labeled as other compositions; ${sourceCoverage.unclassified.toLocaleString('en-US')} unclassified; ${sourceCoverage.measured.toLocaleString('en-US')} with measured subject and focal coordinates. Source metadata does not establish acceptance of the rendered card.</p>
<p>Judge the production card frame, including printed artwork. Sources are comparison evidence. Tight close-ups may pass. Source annotations, where recorded: green subject, yellow focal point, red before crop, blue after crop; crop rectangles precede artwork occlusion.</p>
<nav><label>Search <input id="search" type="search" placeholder="Name, season, source"></label><label>Status <select id="status"><option value="">All</option></select></label><label>Photo type <select id="subtype"><option value="">All</option></select></label></nav>
<p id="count" aria-live="polite"></p><main></main><button id="more">Show 40 more</button>
<script>
const rows=${data};
const main=document.querySelector('main'), search=document.querySelector('#search'), status=document.querySelector('#status'), subtype=document.querySelector('#subtype');let limit=40;
for(const [element,key] of [[status,'review'],[subtype,'subtype']])for(const value of [...new Set(rows.map(r=>r[key]))].sort()){const o=document.createElement('option');o.value=value;o.textContent=value;element.append(o)}
const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el};
function annotate(a,r){if(!r.subjectBounds&&!r.focalPoint)return;const ns='http://www.w3.org/2000/svg',s=document.createElementNS(ns,'svg');s.setAttribute('viewBox','0 0 100 100');s.setAttribute('preserveAspectRatio','none');for(const [box,color]of [[r.subjectBounds,'#80ea94'],[r.beforeCrop,'#ff7f85'],[r.afterCrop,'#70d4f5']]){if(!box)continue;const rect=document.createElementNS(ns,'rect');for(const k of ['x','y','width','height'])rect.setAttribute(k,String(box[k]*100));rect.setAttribute('fill','none');rect.setAttribute('stroke',color);rect.setAttribute('stroke-width','.8');s.append(rect)}if(r.focalPoint){const c=document.createElementNS(ns,'circle');c.setAttribute('cx',r.focalPoint.x*100);c.setAttribute('cy',r.focalPoint.y*100);c.setAttribute('r','2');c.setAttribute('fill','#f9da74');s.append(c)}a.append(s)}
function render(){const q=search.value.toLowerCase(),matched=rows.filter(r=>(!status.value||r.review===status.value)&&(!subtype.value||r.subtype===subtype.value)&&[r.name,r.seasonId,r.sourceId,r.era].join(' ').toLowerCase().includes(q));main.replaceChildren();document.querySelector('#count').textContent=matched.length+' matching captured or reviewed cards';for(const r of matched.slice(0,limit)){const article=document.createElement('article');article.append(text('h2',r.name+' · '+r.seasonId+' · '+(r.slot||'default')));article.append(text('small',r.review+' · '+r.subtype+' · '+r.stage+' · '+r.sourceId));article.append(text('p',r.finding));if(r.annotatedCapture){const a=text('a','Annotated framing comparison');a.href=r.annotatedCapture;article.append(a)}const images=document.createElement('div');images.className='images';for(const [label,path,available]of [['Rendered before','baseline/cards/'+r.id+'.jpg',r.before],['Rendered after','${afterPhase}/cards/'+r.id+'.jpg',r.after],['Source comparison','../../../static'+r.photo,true]]){const f=document.createElement('figure');if(available){const a=document.createElement('a');a.href=path;const im=document.createElement('img');im.src=path;im.alt=r.name+' '+label;im.loading='lazy';a.append(im);if(label==='Source comparison')annotate(a,r);f.append(a)}else{const p=text('div','Capture pending');p.className='missing';f.append(p)}f.append(text('figcaption',label));images.append(f)}article.append(images);main.append(article)}document.querySelector('#more').hidden=limit>=matched.length}
for(const el of [search,status,subtype])el.addEventListener('input',()=>{limit=40;render()});document.querySelector('#more').onclick=()=>{limit+=40;render()};render();
</script></html>`;
await atomicWrite(join(root, 'review.html'), html);
console.log(JSON.stringify(counts));
