<script lang="ts">
 import type { InspectionSeasonView, TeamRank } from '../game/results-types.ts';
 import type { CardViewModel } from './view-model.ts';
 import SourceCredits from './SourceCredits.svelte';

 interface Props {
  s: CardViewModel;
  onDetails: () => void;
  view?: InspectionSeasonView;
  simplified?: boolean;
 }

 let { s, onDetails, view, simplified = false }: Props = $props();
 const colors = $derived.by(function (): { ground: string; ink: string } {
  switch (s.era) {
   case '2020s':
    return { ground: s.k.dark, ink: s.k.paper };
   case '1970s':
    return { ground: s.k.kraft, ink: s.k.fieldOnKraft };
   default:
    return { ground: s.k.stock, ink: s.k.fieldOnStock };
  }
 });

 function ordinal(value: number): string {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
 }

 function rankText(rank: TeamRank): string {
  const position = `${ordinal(rank.rank)} of ${rank.total}`;
  return rank.ties > 1 ? `Tied ${position}` : position;
 }

 function rankLabel(rank: TeamRank): string {
  const standing = rank.best ? 'Team best. ' : rank.worst ? 'Team worst. ' : '';
  const place = rank.ties > 1
   ? `${rank.ties}-way tie for ${ordinal(rank.rank)} of ${rank.total}`
   : `${ordinal(rank.rank)} of ${rank.total}`;
  return `${standing}${place}`;
 }
</script>

{#if view}
 <section
  class="inspection-back results-back"
  class:simplified
  aria-label="{view.label} statistics for {s.full}"
  style:--team-ground={s.k.field}
  style:--team-ink={s.k.onField}
  style:--back-ground={s.k.stock}
  style:--back-ink={s.k.fieldOnStock}
 >
  <header class="results-header">
   <p>{s.pos} · {s.year} · {s.team}</p>
   <h3>{s.full}</h3>
  </header>
  {#if view.label === '162-0 season' && view.awardChips.length > 0}
   <ul class="award-chips" aria-label="Season awards">
    {#each view.awardChips as award (award.key)}
     <li data-tone={award.tone}>{award.label}</li>
    {/each}
   </ul>
  {/if}
  <table>
   <caption>{view.label} statistics and team ranks</caption>
   <thead><tr><th scope="col">Stat</th><th scope="col">Value</th><th scope="col">Team rank</th></tr></thead>
   <tbody>
    {#each view.rows as row (row.key)}
     <tr class:best={row.rank?.best ?? false} class:worst={(row.rank?.worst && !row.rank.best) ?? false}>
      <th scope="row">{row.label}</th>
      <td>{row.formattedValue}</td>
      <td class="rank">
       {#if row.rank}<span aria-label={rankLabel(row.rank)}>{rankText(row.rank)}</span>{:else}<span aria-label="No comparative rank">—</span>{/if}
      </td>
     </tr>
    {/each}
   </tbody>
  </table>
  <footer class="results-footer">
   <span>{view.label}</span>
   {#if !simplified}<button type="button" aria-label="Show text version for {s.full}" onclick={onDetails}>Text version</button>{/if}
  </footer>
  {#if simplified}<SourceCredits details={s.details} />{/if}
 </section>
{:else}
 <section class="inspection-back historical-back" class:simplified data-era={s.era} aria-label="Historical season text version" style:--back-ground={colors.ground} style:--back-ink={colors.ink}>
  <header>
   <p class="era">{s.era} · {s.fin.label}</p>
   <h3 data-layer="name.full">{s.b.name}</h3>
   <p data-layer="team.name">{s.b.team}</p>
   <p data-layer="season.line">{s.b.seasonLine}</p>
   <p data-layer="player.line">{s.b.playerLine}</p>
  </header>
  {#each s.b.fams as family}
   <section class="family" aria-label={family.title} data-layer="family">
    <h4>{family.title}</h4>
    <dl class="keys" data-layer="family.key">
     {#each family.key as stat}<div><dt>{stat.l}</dt><dd data-layer="family.key.value">{stat.v}</dd></div>{/each}
    </dl>
    <dl class="counts" data-layer="family.counts">
     {#each family.counts as stat}<div><dt>{stat.l}</dt><dd data-layer="family.count.value">{stat.v}</dd></div>{/each}
    </dl>
   </section>
  {/each}
  {#if s.b.hasApps}<p data-layer="facts.positions"><strong>Games played:</strong> {s.b.apps}</p>{/if}
  {#if s.b.hasWar}<p data-layer="facts.war">{s.b.war}</p>{:else}<p>WAR/162 unavailable.</p>{/if}
  {#if s.b.pool}<p data-layer="facts.pool">{s.b.pool}</p>{/if}
  <footer>
   <p>{s.logoLabel}</p>
   <p data-layer="sources.stats">{s.b.srcStats}</p>
   <p data-layer="sources.photo">{s.b.srcPhoto}</p>
   {#if !simplified}<button type="button" onclick={onDetails}>Text version</button>{/if}
  </footer>
  {#if simplified}<SourceCredits details={s.details} />{/if}
 </section>
{/if}

<style>
 .inspection-back { position: relative; box-sizing: border-box; background: var(--back-ground); color: var(--back-ink); font: 1rem/1.4 system-ui, sans-serif; text-align: left; }
 .historical-back { padding: 1.25rem; border-radius: .5rem; }
 .historical-back header, .family { padding-bottom: 1rem; margin-bottom: 1rem; border-bottom: 1px solid currentColor; }
 h3 { font: italic 800 1.75rem/1.1 'Barlow Condensed', sans-serif; margin: .5rem 0; overflow-wrap: anywhere; }
 h4 { margin: 0 0 .75rem; font-size: 1.125rem; }
 p { margin: .5rem 0; overflow-wrap: anywhere; }
 .era { font-weight: 700; }
 dl { display: grid; margin: 0; gap: .75rem; }
 .keys { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 1rem; }
 .counts { grid-template-columns: repeat(5, minmax(0, 1fr)); }
 dt { font-weight: 700; font-size: .875rem; }
 dd { font: 700 1.625rem/1.1 'Barlow Condensed', sans-serif; font-variant-numeric: tabular-nums; margin: .25rem 0 0; overflow-wrap: anywhere; }
 .counts dd { font-size: 1.25rem; }
 button { min-height: 2.75rem; color: var(--back-ink); background: var(--back-ground); border: 1px solid currentColor; }
 .results-back { display: flex; flex-direction: column; width: 100%; min-height: 0; aspect-ratio: auto; border-radius: .5rem; }
 .results-back:not(.simplified) { min-height: 140cqw; }
 .results-header { padding: 1rem 1.1rem .9rem; background: var(--team-ground); color: var(--team-ink); }
 .results-header p { margin: 0 0 .25rem; font-size: .75rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
 .results-header h3 { margin: 0; font-size: 1.8rem; line-height: .95; }
 .award-chips { display: flex; flex-wrap: wrap; gap: .35rem; margin: 0; padding: .65rem 1rem 0; list-style: none; }
 .award-chips li { padding: .25rem .5rem; border-radius: 999px; font-size: .68rem; font-weight: 850; letter-spacing: .05em; text-transform: uppercase; }
 .award-chips li[data-tone='gold'] { background: oklch(84% .12 85); color: oklch(28% .07 75); }
 .award-chips li[data-tone='red'] { background: oklch(75% .12 25); color: oklch(25% .09 25); }
 .results-back table { align-self: start; width: calc(100% - 2rem); margin: .6rem 1rem 0; border-collapse: collapse; font-size: .78rem; font-variant-numeric: tabular-nums; }
 caption { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
 .results-back th, .results-back td { height: 1.75rem; padding: .22rem .35rem; color: var(--back-ink); border-bottom: 1px solid color-mix(in srgb, var(--back-ink) 22%, transparent); }
 .results-back thead th { font-size: .63rem; letter-spacing: .06em; text-transform: uppercase; }
 .results-back th:first-child { text-align: left; }
 .results-back th:not(:first-child), .results-back td { text-align: right; }
 .results-back tbody th { font-weight: 700; }
 .results-back tbody td:nth-child(2) { font-weight: 800; }
 .rank span { display: inline-block; min-width: 3.6rem; padding: .12rem .3rem; border-radius: .2rem; text-align: center; }
 .best .rank span { background: oklch(84% .12 85); color: oklch(28% .07 75); font-weight: 850; }
 .worst .rank span { background: oklch(75% .12 25); color: oklch(25% .09 25); font-weight: 850; }
 .results-footer { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin-top: auto; padding: .55rem 1rem .7rem; font-size: .7rem; font-weight: 750; }
 .results-footer button { min-height: 44px; padding: .35rem .65rem; font-size: .875rem; }
 .simplified { --back-ground: var(--surface) !important; --back-ink: var(--text) !important; padding: 1rem; color: var(--text); background: var(--surface); font: 1rem/1.5 system-ui, sans-serif; }
 .simplified h3, .simplified dd { font: inherit; font-weight: 700; }
 .simplified .keys, .simplified .counts { grid-template-columns: repeat(auto-fit, minmax(4rem, 1fr)); }
 .simplified .results-header { padding: 0; color: var(--text); background: transparent; }
 .simplified table { width: 100%; margin-inline: 0; font-size: 1rem; }
 .simplified th, .simplified td { height: auto; padding: .5rem .25rem; overflow-wrap: anywhere; }
 .simplified thead th { font-size: .875rem; letter-spacing: normal; text-transform: none; }
 .simplified .results-footer { padding-inline: 0; font-size: .875rem; }
 @media (max-width: 25rem) {
  .historical-back { padding: 1rem; }
  .counts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .keys { gap: .5rem; }
 }
</style>
