<script lang="ts">
 import type { DraftSharedReport } from '../../draft/share-report.ts';

 /** The shared season's card at 1200 by 630 pixels: the download and the link preview. Sizes are fixed pixels so it draws the same on every device. */
 let { report }: { report: DraftSharedReport } = $props();
 const ordinal = (value: number) => `${value}${value === 1 ? 'st' : value === 2 ? 'nd' : value === 3 ? 'rd' : 'th'}`;
 const top = $derived(report.roster.filter(card => card.slot !== 'Res').slice(0, 4));
</script>

<div class="card" data-draft-card>
 <div class="left">
  <p class="brand">162-0 · Draft Mode</p>
  <p class="club">{report.club}</p>
  <p class="record">{report.record.wins}–{report.record.losses}</p>
  <p class="facts"><span class="grade">{report.grade}</span> {ordinal(report.place)} of {report.standings.length} · {report.rival.wins}–{report.rival.losses} vs {report.rival.club}</p>
  {#if report.moments[0]}<p class="moment">{report.moments[0].title}</p>{/if}
 </div>
 <div class="right">
  <ol class="table">
   {#each report.standings as row, index (index)}
    <li class:you={row.you}><span>{index + 1}</span><span class="name">{row.club}</span><span>{row.wins}–{row.losses}</span></li>
   {/each}
  </ol>
  <ul class="stars">{#each top as card, index (index)}<li><b>{card.label}</b> {card.line}</li>{/each}</ul>
 </div>
</div>

<style>
 .card { box-sizing: border-box; width: 1200px; height: 630px; padding: 56px 60px; display: grid; grid-template-columns: 1.1fr 1fr; gap: 48px; background: #11161c; color: #f3f5f7; font-family: var(--font-body, system-ui, sans-serif); overflow: hidden; }
 p { margin: 0; }
 .left { display: grid; align-content: start; gap: 14px; min-width: 0; }
 .brand { color: #c4e05a; font-size: 22px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
 .club { font-size: 40px; font-weight: 800; line-height: 1.1; }
 .record { font-size: 132px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
 .facts { font-size: 26px; color: #b9c2cc; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
 .grade { display: inline-grid; place-items: center; min-width: 64px; height: 64px; padding: 0 10px; border-radius: 12px; background: #c4e05a; color: #11161c; font-size: 34px; font-weight: 800; }
 .moment { font-size: 22px; color: #b9c2cc; line-height: 1.3; }
 .right { display: grid; align-content: start; gap: 22px; min-width: 0; }
 .table { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-size: 22px; font-variant-numeric: tabular-nums; }
 .table li { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 12px; color: #b9c2cc; }
 .table li.you { color: #c4e05a; font-weight: 800; }
 .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
 .stars { list-style: none; margin: 0; padding: 18px 0 0; border-top: 1px solid #2c3540; display: grid; gap: 6px; font-size: 18px; color: #b9c2cc; }
 .stars b { color: #f3f5f7; }
</style>
