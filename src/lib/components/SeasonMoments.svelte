<script lang="ts">
 import type { SeasonResult } from '../sim/types.ts';
 import { formatSeasonMoment } from './season-moment.ts';

 interface Props { result: SeasonResult }

 let { result }: Props = $props();
 let highlight = $derived(result.highlight ? formatSeasonMoment(result.highlight, result.games.find(game => game.number === result.highlight?.gameNumber)) : null);
 let lowlight = $derived(result.lowlight ? formatSeasonMoment(result.lowlight, result.games.find(game => game.number === result.lowlight?.gameNumber)) : null);
</script>

<section class="season-moments" aria-labelledby="season-moments-heading">
 <div class="heading">
  <p class="eyebrow">Biggest win-expectancy swings</p>
  <h3 id="season-moments-heading">Season turning points</h3>
 </div>
 <div class="moment-grid">
  <article class="moment-card highlight">
   <p class="moment-label">Season highlight</p>
   {#if highlight}
    <h4>{highlight.matchup}</h4>
    <p class="situation">{highlight.situation}</p>
    <p class="story">{highlight.action} {highlight.score}</p>
    <div class="expectancy">
     <span>Estimated neutral league-rate win expectancy</span>
     <strong>{highlight.winChance} <small>{highlight.swing}</small></strong>
    </div>
    {#if highlight.final}<p class="final">{highlight.final}</p>{/if}
   {:else}
    <p class="empty">No positive win-expectancy swing was recorded this season.</p>
   {/if}
  </article>

  <article class="moment-card lowlight">
   <p class="moment-label">Season lowlight</p>
   {#if lowlight}
    <h4>{lowlight.matchup}</h4>
    <p class="situation">{lowlight.situation}</p>
    <p class="story">{lowlight.action} {lowlight.score}</p>
    <div class="expectancy">
     <span>Estimated neutral league-rate win expectancy</span>
     <strong>{lowlight.winChance} <small>{lowlight.swing}</small></strong>
    </div>
    {#if lowlight.final}<p class="final">{lowlight.final}</p>{/if}
   {:else}
    <p class="empty">No negative win-expectancy swing was recorded this season.</p>
   {/if}
  </article>
 </div>
 <p class="model-note">Win expectancy is an equal-strength estimate from the inning, half, outs, occupied bases, score, and neutral league rates. Future plate appearances use fixed league rates and simplified base advancement; player and team strength are not modeled, and future steals, errors, double plays, and sacrifice flies are omitted. Ties after regulation are valued at 50%, with no ghost runner.</p>
</section>

<style>
 .season-moments { display: grid; gap: var(--space-4); min-width: 0; }
 .heading .eyebrow { margin: 0 0 var(--space-2); }
 .heading h3 { font-size: var(--text-xl); }
 .moment-grid { display: grid; gap: var(--space-4); }
 .moment-card { display: grid; align-content: start; gap: var(--space-3); min-width: 0; padding: var(--space-5); border: 1px solid var(--border); border-top: .25rem solid var(--border); background: var(--surface); }
 .moment-card.highlight { border-top-color: var(--success); }
 .moment-card.lowlight { border-top-color: var(--error); }
 .moment-label { margin: 0; color: var(--muted); font-size: var(--text-xs); font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
 h4 { margin: 0; font-size: var(--text-lg); }
 .situation, .story, .final, .empty { margin: 0; }
 .situation, .final { color: var(--muted); font-size: var(--text-sm); }
 .story { max-width: 64ch; line-height: 1.55; }
 .expectancy { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--space-2) var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border); }
 .expectancy > span { max-width: 18rem; color: var(--muted); font-size: var(--text-xs); }
 .expectancy strong { font-size: var(--text-lg); font-variant-numeric: tabular-nums; white-space: nowrap; }
 .expectancy small { margin-left: var(--space-2); color: var(--text); font-size: var(--text-sm); }
 .model-note { max-width: 78ch; margin: 0; color: var(--muted); font-size: var(--text-xs); line-height: 1.5; }
 @media (min-width: 48rem) {
  .moment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
 }
 @media (max-width: 30rem) {
  .moment-card { padding: var(--space-4); }
  .expectancy { align-items: start; }
  .expectancy strong { width: 100%; }
 }
</style>
