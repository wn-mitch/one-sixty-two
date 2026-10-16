import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite } from './cache.ts';

/** Reconcile actual captures and explicit visual judgments; never infer a review from a group. */
const root = join(process.cwd(), '.cache/media/framing');
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
const before = await captures('baseline'), after = await captures('after');
const reviews = new Map<string, Row>();
for (const path of ['reviews-framing.json', 'reviews-review.json', 'reviews-root.json', 'reviews-capture.json', 'baseline/reviews.json', 'after/reviews.json', 'blackwell-reviews.json', 'independent-root-proposal-review.json', 'independent-root2-proposal-review.json', 'independent-capture-proposal-review.json', 'reviews-root3-independent.json']) {
	for (const review of await json<Row[]>(path, [])) reviews.set(review.id, review);
}
const derivative = (url: string) => url.split('/').at(-1);
const entries = inventory.entries.map(entry => {
	const candidate = reviews.get(entry.id);
	const review = candidate && derivative(candidate.photo ?? '') === derivative(entry.photo) ? candidate : undefined;
	const status = String(review?.review ?? review?.status ?? 'pending');
	return { ...entry, review: status, subtype: review?.subtype ?? 'unclassified', finding: review?.finding ?? review?.note ?? '',
		stage: review?.reviewStage ?? (review ? 'rendered baseline' : ''), before: before.has(entry.id), after: after.has(entry.id),
		annotatedCapture: review?.annotatedCapture,
		subjectBounds: review?.subjectBounds, focalPoint: review?.focalPoint, beforeCrop: review?.beforeCrop, afterCrop: review?.afterCrop };
});
const counts = {
	expected: entries.length,
	beforeCaptured: entries.filter(row => row.before).length,
	afterCaptured: entries.filter(row => row.after).length,
	reviewed: entries.filter(row => row.review !== 'pending').length,
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
<p>${counts.expected.toLocaleString('en-US')} full fronts inventoried; ${counts.beforeCaptured.toLocaleString('en-US')} before captures; ${counts.afterCaptured.toLocaleString('en-US')} after captures; ${counts.reviewed.toLocaleString('en-US')} individual review records. Uncaptured and unreviewed cards remain pending. A representative review does not mark its other card variants reviewed.</p>
<p>Judge the production card frame, including printed artwork. Sources are comparison evidence. Tight close-ups may pass. Source annotations, where recorded: green subject, yellow focal point, red before crop, blue after crop; crop rectangles precede artwork occlusion.</p>
<nav><label>Search <input id="search" type="search" placeholder="Name, season, source"></label><label>Status <select id="status"><option value="">All</option></select></label><label>Photo type <select id="subtype"><option value="">All</option></select></label></nav>
<p id="count" aria-live="polite"></p><main></main><button id="more">Show 40 more</button>
<script>
const rows=${data};
const main=document.querySelector('main'), search=document.querySelector('#search'), status=document.querySelector('#status'), subtype=document.querySelector('#subtype');let limit=40;
for(const [element,key] of [[status,'review'],[subtype,'subtype']])for(const value of [...new Set(rows.map(r=>r[key]))].sort()){const o=document.createElement('option');o.value=value;o.textContent=value;element.append(o)}
const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el};
function annotate(a,r){if(!r.subjectBounds&&!r.focalPoint)return;const ns='http://www.w3.org/2000/svg',s=document.createElementNS(ns,'svg');s.setAttribute('viewBox','0 0 100 100');s.setAttribute('preserveAspectRatio','none');for(const [box,color]of [[r.subjectBounds,'#80ea94'],[r.beforeCrop,'#ff7f85'],[r.afterCrop,'#70d4f5']]){if(!box)continue;const rect=document.createElementNS(ns,'rect');for(const k of ['x','y','width','height'])rect.setAttribute(k,String(box[k]*100));rect.setAttribute('fill','none');rect.setAttribute('stroke',color);rect.setAttribute('stroke-width','.8');s.append(rect)}if(r.focalPoint){const c=document.createElementNS(ns,'circle');c.setAttribute('cx',r.focalPoint.x*100);c.setAttribute('cy',r.focalPoint.y*100);c.setAttribute('r','2');c.setAttribute('fill','#f9da74');s.append(c)}a.append(s)}
function render(){const q=search.value.toLowerCase(),matched=rows.filter(r=>(!status.value||r.review===status.value)&&(!subtype.value||r.subtype===subtype.value)&&[r.name,r.seasonId,r.sourceId,r.era].join(' ').toLowerCase().includes(q));main.replaceChildren();document.querySelector('#count').textContent=matched.length+' matching captured or reviewed cards';for(const r of matched.slice(0,limit)){const article=document.createElement('article');article.append(text('h2',r.name+' · '+r.seasonId+' · '+(r.slot||'default')));article.append(text('small',r.review+' · '+r.subtype+' · '+r.stage+' · '+r.sourceId));article.append(text('p',r.finding));if(r.annotatedCapture){const a=text('a','Annotated framing comparison');a.href=r.annotatedCapture;article.append(a)}const images=document.createElement('div');images.className='images';for(const [label,path,available]of [['Rendered before','baseline/cards/'+r.id+'.jpg',r.before],['Rendered after','after/cards/'+r.id+'.jpg',r.after],['Source comparison','../../../static'+r.photo,true]]){const f=document.createElement('figure');if(available){const a=document.createElement('a');a.href=path;const im=document.createElement('img');im.src=path;im.alt=r.name+' '+label;im.loading='lazy';a.append(im);if(label==='Source comparison')annotate(a,r);f.append(a)}else{const p=text('div','Capture pending');p.className='missing';f.append(p)}f.append(text('figcaption',label));images.append(f)}article.append(images);main.append(article)}document.querySelector('#more').hidden=limit>=matched.length}
for(const el of [search,status,subtype])el.addEventListener('input',()=>{limit=40;render()});document.querySelector('#more').onclick=()=>{limit+=40;render()};render();
</script></html>`;
await atomicWrite(join(root, 'review.html'), html);
console.log(JSON.stringify(counts));
