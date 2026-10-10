<script lang="ts">
 import type { AtmospherePhoto } from '../media/types.ts';
 import type { StadiumSummary } from '../sim/park-types.ts';
 import TeamLogo from './TeamLogo.svelte';

 let { stadium, franchiseName, photo = null, compact = false }: {
  stadium: StadiumSummary;
  franchiseName: string;
  photo?: AtmospherePhoto | null;
  /** Sized from the containing card's width, without the header, for a card back. */
  compact?: boolean;
 } = $props();

 const BASE_M = 27.432;
 const diagonal = BASE_M / Math.SQRT2;
 const reach = $derived(Math.max(...stadium.outline.flatMap(([x, y]) => [Math.abs(x), y])) + 6);
 const point = ([x, y]: readonly [number, number]) => `${x.toFixed(1)},${(-y).toFixed(1)}`;
 const field = $derived([[0, 0] as const, ...stadium.outline, [0, 0] as const].map(point).join(' '));
 const diamond = [[0, 0], [diagonal, diagonal], [0, 2 * diagonal], [-diagonal, diagonal]].map(value => point(value as [number, number])).join(' ');
 const key = $derived(([['LF', -45], ['CF', 0], ['RF', 45]] as const).map(([label, bearing]) => ({ label, dimension: stadium.dimensions.find(item => item.bearingDeg === bearing) })));
 const roof = $derived(stadium.roofState === 'open' ? 'Retractable roof, open' : stadium.roofState === 'closed' ? 'Closed roof' : 'Open air');
 const feet = (value: number) => `${Math.round(value)} ft`;
</script>

<article class="stadium-card" class:compact>
 {#if !compact}
 <header>
  <TeamLogo franchiseId={stadium.franchiseId} label={franchiseName} size="small" />
  <div>
   <h3>{stadium.name}</h3>
   <p class="muted">{franchiseName} · {stadium.referenceYear}</p>
  </div>
 </header>
 {/if}
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
 {#if photo}
  <p class="credit muted">Photo {photo.year} · <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.credit}</a> · <a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a></p>
 {/if}
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
 .credit { margin: 0; font-size: var(--text-xs); overflow-wrap: anywhere; }
 .credit a { color: inherit; }
 .compact { gap: calc(100cqi * 3 / 100); }
 .compact svg { width: 82%; justify-self: center; }
 .compact .dimensions { gap: calc(100cqi * 1.5 / 100); }
 .compact dt { font-size: calc(100cqi * 4 / 100); }
 .compact dd { font-size: calc(100cqi * 5.2 / 100); }
 .compact .conditions, .compact .credit { font-size: calc(100cqi * 3.8 / 100); line-height: 1.3; }
</style>
