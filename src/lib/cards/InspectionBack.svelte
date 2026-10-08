<script lang="ts">
 import type { CardViewModel } from './view-model.ts';
 interface Props {
  s: CardViewModel;
  onDetails: () => void;
 }
 let { s, onDetails }: Props = $props();
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
</script>

<section class="inspection-back" data-era={s.era} aria-label="Historical season text version" style:--back-ground={colors.ground} style:--back-ink={colors.ink}>
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
 {#if s.b.hasWar}<p data-layer="facts.war">{s.b.war}</p>{:else}<p>WAR/162 unavailable. {s.b.isBullpen ? 'No composite WAR is available for team units.' : 'Ranking does not affect simulation inputs.'}</p>{/if}
 {#if s.b.pool}<p data-layer="facts.pool">{s.b.pool}</p>{/if}
 <footer>
  <p>{s.logoLabel}</p>
  <p data-layer="sources.stats">{s.b.srcStats}</p>
  <p data-layer="sources.photo">{s.b.srcPhoto}</p>
  <button type="button" onclick={onDetails}>Details ›</button>
 </footer>
</section>

<style>
 .inspection-back { position: relative; padding: 1.25rem; border-radius: .5rem; background: var(--back-ground); color: var(--back-ink); font: 1rem/1.4 system-ui, sans-serif; text-align: left; }
 header, .family { padding-bottom: 1rem; margin-bottom: 1rem; border-bottom: 1px solid currentColor; }
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
 @media (max-width: 25rem) { .inspection-back { padding: 1rem; } .counts { grid-template-columns: repeat(3, minmax(0, 1fr)); } .keys { gap: .5rem; } }
</style>
