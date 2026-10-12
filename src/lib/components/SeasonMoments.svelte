<script lang="ts">
 import Card from '../cards/Card.svelte';
 import type { CardViewModel } from '../cards/view-model.ts';
 import type { ResultsCard } from '../game/results-types.ts';
 import type { SeasonMoment, SeasonResult, WinPoint } from '../sim/types.ts';
 import MomentWinChart from './MomentWinChart.svelte';
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

{#snippet momentPanel(label: string, tone: 'highlight' | 'lowlight', copy: SeasonMomentCopy | null, card: ResultsCard | null, view: CardViewModel | null, moment: SeasonMoment | null, trace: WinPoint[] | null)}
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
    <blockquote class="call"><p>“{copy.call}”</p></blockquote>
    <p class="story">{copy.action} {copy.score}</p>
    {#if moment && trace?.length}
     <MomentWinChart {trace} {moment} {tone} summary={`${copy.winChance} (${copy.swing})`} />
    {:else}
     <p class="expectancy">{copy.winChance} <small>{copy.swing}</small></p>
    {/if}
    {#if copy.final}<p class="final">{copy.final}</p>{/if}
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
  {@render momentPanel('Season highlight', 'highlight', highlight, highlightCard, highlightView, result.highlight, result.highlightTrace)}
  {@render momentPanel('Season lowlight', 'lowlight', lowlight, lowlightCard, lowlightView, result.lowlight, result.lowlightTrace)}
 </div>
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
 /* Only the card itself is the inspect target; it does not stretch down the panel. */
 .participant-card { all: unset; display: block; align-self: start; width: 100%; border-radius: var(--radius); cursor: pointer; touch-action: manipulation; }
 .participant-card:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
 .participant-art { display: block; width: 100%; border-radius: var(--radius); box-shadow: 0 .75rem 1.5rem color-mix(in oklch, var(--background) 68%, transparent); }
 .moment-copy { display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: var(--space-3); min-width: 0; }
 .moment-label { margin: 0; color: var(--muted); font-size: var(--text-xs); font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
 .highlight .moment-label { color: var(--success); }
 .lowlight .moment-label { color: var(--error); }
 h4 { margin: 0; font-size: var(--text-lg); overflow-wrap: anywhere; }
 .situation, .story, .final, .empty { margin: 0; }
 .situation, .final { color: var(--muted); font-size: var(--text-sm); }
 .call { margin: 0; padding-left: var(--space-3); border-left: 3px solid var(--border); }
 .call p { margin: 0; max-width: 56ch; font: italic 700 1.375rem/1.2 'Barlow Condensed', sans-serif; letter-spacing: .005em; }
 .story { max-width: 64ch; color: var(--muted); font-size: var(--text-sm); line-height: 1.55; }
 .expectancy { margin: 0; padding-top: var(--space-3); border-top: 1px solid var(--border); font-weight: 750; font-variant-numeric: tabular-nums; }
 .expectancy small { margin-left: var(--space-2); font-size: var(--text-sm); }
 @media (min-width: 48rem) {
  .moment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
 }
 @media (max-width: 30rem) {
  .moment-card { gap: var(--space-3); padding: var(--space-4); }
  .moment-card.has-participant { grid-template-columns: 4.5rem minmax(0, 1fr); }
 }
</style>
