<script lang="ts">
 import type { StadiumSummary } from '../sim/park-types.ts';
 import TeamLogo from './TeamLogo.svelte';

 let { stadium, franchiseName }: { stadium: StadiumSummary; franchiseName: string } = $props();

 const BASE_M = 27.432;
 const diagonal = BASE_M / Math.SQRT2;
 const reach = $derived(Math.max(...stadium.outline.flatMap(([x, y]) => [Math.abs(x), y])) + 6);
 const point = ([x, y]: readonly [number, number]) => `${x.toFixed(1)},${(-y).toFixed(1)}`;
 const field = $derived([[0, 0] as const, ...stadium.outline, [0, 0] as const].map(point).join(' '));
 const diamond = [[0, 0], [diagonal, diagonal], [0, 2 * diagonal], [-diagonal, diagonal]].map(value => point(value as [number, number])).join(' ');
 const key = $derived(([['LF', -45], ['CF', 0], ['RF', 45]] as const).map(([label, bearing]) => ({ label, dimension: stadium.dimensions.find(item => item.bearingDeg === bearing) })));
 const estimated = $derived(stadium.dimensions.some(item => item.distanceEstimated || item.heightEstimated));
 const roof = $derived(stadium.roofState === 'open' ? 'Retractable roof, open' : stadium.roofState === 'closed' ? 'Closed roof' : 'Open air');
 const feet = (value: number) => `${Math.round(value)} ft`;
</script>

<article class="stadium-card">
 <header>
  <TeamLogo franchiseId={stadium.franchiseId} label={franchiseName} size="small" />
  <div>
   <h3>{stadium.name}</h3>
   <p class="muted">{franchiseName} · {stadium.referenceYear}</p>
  </div>
 </header>
 <svg viewBox={`${-reach} ${-reach} ${2 * reach} ${reach + 8}`} role="img" aria-label={`Field outline of ${stadium.name}`}>
  <polygon class="grass" points={field} />
  <polygon class="infield" points={diamond} />
 </svg>
 <dl class="dimensions">
  {#each key as { label, dimension } (label)}
   {#if dimension}
    <div><dt>{label}</dt><dd>{feet(dimension.distanceFt)}{dimension.distanceEstimated ? ' est.' : ''}</dd></div>
   {/if}
  {/each}
  <div><dt>Wall</dt><dd>{stadium.wallHeightFt.min === stadium.wallHeightFt.max ? feet(stadium.wallHeightFt.max) : `${Math.round(stadium.wallHeightFt.min)}–${feet(stadium.wallHeightFt.max)}`}</dd></div>
 </dl>
 <p class="conditions muted">{roof}{stadium.elevationFt === null ? ' · sea level (estimated)' : ` · ${stadium.elevationFt.toLocaleString('en-US')} ft elevation`}</p>
 <details>
  <summary>Measurements and sources</summary>
  <table>
   <thead><tr><th scope="col">Point</th><th scope="col">Distance</th><th scope="col">Wall</th></tr></thead>
   <tbody>
    {#each stadium.dimensions as dimension (dimension.label + dimension.bearingDeg)}
     <tr><th scope="row">{dimension.label}</th><td>{feet(dimension.distanceFt)}{dimension.distanceEstimated ? ' (est.)' : ''}</td><td>{feet(dimension.heightFt)}{dimension.heightEstimated ? ' (est.)' : ''}</td></tr>
    {/each}
   </tbody>
  </table>
  <p>Statcast 2025 measured distances and heights; the wall between measured points is interpolated.{estimated ? ' Points marked est. are estimates.' : ''} Calm air at the venue's elevation; weather is not modelled.</p>
  {#each stadium.notices as notice, index (index)}<p>{notice}</p>{/each}
 </details>
</article>

<style>
 .stadium-card { display: grid; gap: var(--space-2); }
 header { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
 h3 { margin: 0; font-size: var(--text-sm); line-height: 1.25; overflow-wrap: anywhere; }
 header p { margin: 0; font-size: var(--text-xs); }
 svg { width: 100%; height: auto; display: block; }
 .grass { fill: oklch(22% .022 160); stroke: var(--muted); stroke-width: 1.2; }
 .infield { fill: oklch(34% .03 60); }
 .dimensions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-1); margin: 0; font-variant-numeric: tabular-nums; }
 .dimensions div { display: grid; }
 dt { font-size: var(--text-xs); color: var(--muted); }
 dd { margin: 0; font-size: var(--text-xs); font-weight: 700; }
 .conditions { margin: 0; font-size: var(--text-xs); }
 details { font-size: var(--text-xs); }
 summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; color: var(--muted); }
 details p { margin: var(--space-2) 0 0; max-width: 68ch; }
 table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
 th, td { text-align: left; padding: 2px var(--space-1) 2px 0; font-weight: 400; }
 thead th { color: var(--muted); }
</style>
