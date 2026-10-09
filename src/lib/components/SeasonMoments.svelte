<script lang="ts">
 import Card from '../cards/Card.svelte';
 import type { CardViewModel } from '../cards/view-model.ts';
 import type { ResultsCard } from '../game/results-types.ts';
 import type { SeasonResult } from '../sim/types.ts';
 import { formatSeasonMoment } from './season-moment.ts';
 import type { SeasonMomentCopy } from './season-moment.ts';

 interface Props {
  result: SeasonResult;
  cards: readonly ResultsCard[];
  cardViews: ReadonlyMap<string, CardViewModel>;
  selectedSeasonId: string | null;
  reviewId: string;
  onInspect: (seasonId: string, trigger: HTMLButtonElement) => void;
 }

 let { result, cards, cardViews, selectedSeasonId, reviewId, onInspect }: Props = $props();
 let highlight = $derived(result.highlight ? formatSeasonMoment(result.highlight, result.games.find(game => game.number === result.highlight?.gameNumber)) : null);
 let lowlight = $derived(result.lowlight ? formatSeasonMoment(result.lowlight, result.games.find(game => game.number === result.lowlight?.gameNumber)) : null);
 let highlightSeasonId = $derived(result.highlight ? (result.highlight.challengeBatting ? result.highlight.batterSeasonId : result.highlight.pitcherSeasonId) : null);
 let lowlightSeasonId = $derived(result.lowlight ? (result.lowlight.challengeBatting ? result.lowlight.batterSeasonId : result.lowlight.pitcherSeasonId) : null);
 let highlightCard = $derived(highlightSeasonId ? cards.find(card => card.seasonId === highlightSeasonId) ?? null : null);
 let lowlightCard = $derived(lowlightSeasonId ? cards.find(card => card.seasonId === lowlightSeasonId) ?? null : null);
 let highlightView = $derived(highlightSeasonId ? cardViews.get(highlightSeasonId) ?? null : null);
 let lowlightView = $derived(lowlightSeasonId ? cardViews.get(lowlightSeasonId) ?? null : null);

 function noDetails(): void {}
</script>

{#snippet momentPanel(label: string, tone: 'highlight' | 'lowlight', copy: SeasonMomentCopy | null, card: ResultsCard | null, view: CardViewModel | null)}
 <article class={`moment-card ${tone}`} class:has-participant={!!card && !!view}>
  {#if copy}
   {#if card && view}
    <button
     type="button"
     class="participant-card"
     aria-label={`Inspect ${card.profile.year} ${card.profile.displayName}, ${label.toLowerCase()}`}
     aria-expanded={selectedSeasonId === card.seasonId}
     aria-controls={reviewId}
     onclick={event => onInspect(card.seasonId, event.currentTarget)}
    >
     <span class="participant-art" aria-hidden="true" inert>
      <Card s={view} face="front" interactive={false} onDetails={noDetails} />
     </span>
    </button>
   {/if}
   <div class="moment-copy">
    <p class="moment-label">{label}</p>
    <h4>{copy.matchup}</h4>
    <p class="situation">{copy.situation}</p>
    <p class="story">{copy.action} {copy.score}</p>
    <div class="expectancy">
     <span>Estimated neutral league-rate win expectancy</span>
     <strong>{copy.winChance} <small>{copy.swing}</small></strong>
    </div>
    {#if copy.final}<p class="final">{copy.final}</p>{/if}
    {#if card && view}
     <button type="button" class="inspect-action" aria-expanded={selectedSeasonId === card.seasonId} aria-controls={reviewId} onclick={event => onInspect(card.seasonId, event.currentTarget)}>
      Inspect {card.profile.displayName}
     </button>
    {/if}
   </div>
  {:else}
   <div class="moment-copy">
    <p class="moment-label">{label}</p>
    <p class="empty">No {tone === 'highlight' ? 'positive' : 'negative'} win-expectancy swing was recorded this season.</p>
   </div>
  {/if}
 </article>
{/snippet}

<section class="season-moments" aria-labelledby="season-moments-heading">
 <div class="heading">
  <p class="eyebrow">Biggest win-expectancy swings</p>
  <h3 id="season-moments-heading">Season turning points</h3>
 </div>
 <div class="moment-grid">
  {@render momentPanel('Season highlight', 'highlight', highlight, highlightCard, highlightView)}
  {@render momentPanel('Season lowlight', 'lowlight', lowlight, lowlightCard, lowlightView)}
 </div>
 <p class="model-note">Win expectancy is an equal-strength estimate from the inning, half, outs, occupied bases, score, and neutral league rates. Future plate appearances use fixed league rates and simplified base advancement; player and team strength are not modeled, and future steals, errors, double plays, and sacrifice flies are omitted. Ties after regulation are valued at 50%, with no ghost runner.</p>
</section>

<style>
 .season-moments { display: grid; gap: var(--space-4); min-width: 0; }
 .heading .eyebrow { margin: 0 0 var(--space-2); }
 .heading h3 { font-size: var(--text-xl); }
 .moment-grid { display: grid; gap: var(--space-4); }
 .moment-card { display: grid; align-content: start; gap: var(--space-4); min-width: 0; padding: var(--space-5); border: 1px solid var(--border); border-top: .25rem solid var(--border); border-radius: var(--radius); background: var(--surface); }
 .moment-card.has-participant { grid-template-columns: 6.875rem minmax(0, 1fr); }
 .moment-card.highlight { border-top-color: var(--success); }
 .moment-card.lowlight { border-top-color: var(--error); }
 .participant-card { all: unset; display: block; width: 100%; border-radius: var(--radius); cursor: pointer; touch-action: manipulation; }
 .participant-card:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
 .participant-art { display: block; width: 100%; border-radius: var(--radius); box-shadow: 0 .75rem 1.5rem color-mix(in oklch, var(--background) 68%, transparent); }
 .moment-copy { display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: var(--space-3); min-width: 0; }
 .moment-label { margin: 0; color: var(--muted); font-size: var(--text-xs); font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
 .highlight .moment-label { color: var(--success); }
 .lowlight .moment-label { color: var(--error); }
 h4 { margin: 0; font-size: var(--text-lg); overflow-wrap: anywhere; }
 .situation, .story, .final, .empty { margin: 0; }
 .situation, .final { color: var(--muted); font-size: var(--text-sm); }
 .story { max-width: 64ch; line-height: 1.55; }
 .expectancy { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--space-2) var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border); }
 .expectancy > span { max-width: 18rem; color: var(--muted); font-size: var(--text-xs); }
 .expectancy strong { font-size: var(--text-lg); font-variant-numeric: tabular-nums; white-space: normal; }
 .expectancy small { display: inline-block; margin-left: var(--space-2); color: var(--text); font-size: var(--text-sm); white-space: nowrap; }
 .inspect-action { justify-self: start; min-height: 2.75rem; }
 .model-note { max-width: 78ch; margin: 0; color: var(--muted); font-size: var(--text-xs); line-height: 1.5; }
 @media (min-width: 48rem) {
  .moment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
 }
 @media (max-width: 30rem) {
  .moment-card { gap: var(--space-3); padding: var(--space-4); }
  .moment-card.has-participant { grid-template-columns: 4.5rem minmax(0, 1fr); }
  .expectancy { align-items: start; }
  .expectancy strong { width: 100%; }
 }
</style>
