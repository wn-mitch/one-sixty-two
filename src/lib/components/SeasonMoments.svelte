<script lang="ts">
 import Card from '../cards/Card.svelte';
 import { createCardViewModel, type CardViewModel } from '../cards/view-model.ts';
 import { loadSimulation } from '../game/data.ts';
 import type { ResultsCard } from '../game/results-types.ts';
 import type { Manifest, Profile } from '../game/types.ts';
 import type { MediaManifest } from '../media/types.ts';
 import type { WarRankings } from '../rankings/types.ts';
 import type { SeasonMoment, SeasonResult, WinPoint } from '../sim/types.ts';
 import MomentWinChart from './MomentWinChart.svelte';
 import { formatSeasonMoment, momentParticipant } from './season-moment.ts';
 import type { SeasonMomentCopy } from './season-moment.ts';

 interface Props {
  result: SeasonResult;
  cards: readonly ResultsCard[];
  cardViews: ReadonlyMap<string, CardViewModel>;
  selectedSeasonId: string | null;
  reviewId: string;
  onInspect: (seasonId: string, trigger: HTMLButtonElement) => void;
  /** Build cards for opponents and the league bullpen; without them those moments show no card. */
  manifest?: Manifest | null;
  media?: MediaManifest | null;
  rankings?: WarRankings | null;
 }

 let { result, cards, cardViews, selectedSeasonId, reviewId, onInspect, manifest = null, media = null, rankings = null }: Props = $props();
 let highlight = $derived(result.highlight ? formatSeasonMoment(result.highlight, result.games.find(game => game.number === result.highlight?.gameNumber), undefined, result.seed) : null);
 let lowlight = $derived(result.lowlight ? formatSeasonMoment(result.lowlight, result.games.find(game => game.number === result.lowlight?.gameNumber), undefined, result.seed) : null);
 let highlightSeasonId = $derived(momentParticipant(result.highlight));
 let lowlightSeasonId = $derived(momentParticipant(result.lowlight));
 let highlightCard = $derived(highlightSeasonId ? cards.find(card => card.seasonId === highlightSeasonId) ?? null : null);
 let lowlightCard = $derived(lowlightSeasonId ? cards.find(card => card.seasonId === lowlightSeasonId) ?? null : null);
 /** Players outside your roster (opponents, the league bullpen) found in the season's simulation data. */
 let outsiders = $state.raw<ReadonlyMap<string, Profile>>(new Map());
 $effect(() => {
  const wanted = [highlightSeasonId, lowlightSeasonId].filter((id): id is string => !!id && !cardViews.has(id));
  if (!manifest || !wanted.length) return;
  let cancelled = false;
  loadSimulation(manifest).then(data => {
   if (cancelled) return;
   const pool = [data.bullpen, ...data.opponents.flatMap(team => [...team.hitters, ...team.starters, team.closer, ...team.relievers, team.bullpen])];
   outsiders = new Map(pool.filter(profile => wanted.includes(profile.seasonId)).map(profile => [profile.seasonId, profile]));
  }, () => {});
  return () => { cancelled = true; };
 });
 function outsiderView(seasonId: string | null): CardViewModel | null {
  const profile = seasonId ? outsiders.get(seasonId) : undefined;
  return profile ? createCardViewModel({ profile, manifest, media, rankings, mediaStatus: media ? 'ready' : 'loading' }) : null;
 }
 let highlightView = $derived(highlightSeasonId ? cardViews.get(highlightSeasonId) ?? outsiderView(highlightSeasonId) : null);
 let lowlightView = $derived(lowlightSeasonId ? cardViews.get(lowlightSeasonId) ?? outsiderView(lowlightSeasonId) : null);

 function noDetails(): void {}
</script>

{#snippet momentPanel(label: string, tone: 'highlight' | 'lowlight', copy: SeasonMomentCopy | null, card: ResultsCard | null, view: CardViewModel | null, moment: SeasonMoment | null, trace: WinPoint[] | null)}
 <article class={`moment-card ${tone}`} class:has-participant={!!view}>
  {#if copy}
   {#if view && !card}
    <!-- Not one of yours: the opponent's card shows in black and white. -->
    <figure class="participant-card outsider">
     <span class="participant-art" aria-hidden="true" inert>
      <Card s={view} face="front" interactive={false} onDetails={noDetails} />
     </span>
     <figcaption>Opponent</figcaption>
    </figure>
   {:else if card && view}
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
 /* The player card leads the panel; the copy reads as its caption. */
 .moment-card.has-participant { grid-template-columns: 11rem minmax(0, 1fr); }
 .moment-card.highlight { border-top-color: var(--success); }
 .moment-card.lowlight { border-top-color: var(--error); }
 /* Only the card itself is the inspect target; it does not stretch down the panel. */
 .participant-card { all: unset; display: block; align-self: start; width: 100%; border-radius: var(--radius); cursor: pointer; touch-action: manipulation; }
 .outsider { display: grid; gap: var(--space-2); margin: 0; cursor: default; }
 .outsider .participant-art { filter: grayscale(1) contrast(1.05); }
 .outsider figcaption { color: var(--muted); font-size: var(--text-xs); font-weight: 750; letter-spacing: .08em; text-align: center; text-transform: uppercase; }
 .participant-card:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
 .participant-art { display: block; width: 100%; border-radius: var(--radius); box-shadow: 0 .75rem 1.5rem color-mix(in oklch, var(--background) 68%, transparent); }
 .moment-copy { display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: var(--space-2); min-width: 0; }
 .moment-label { margin: 0; color: var(--muted); font-size: var(--text-xs); font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
 .highlight .moment-label { color: var(--success); }
 .lowlight .moment-label { color: var(--error); }
 h4 { margin: 0; font-size: var(--text-base); overflow-wrap: anywhere; }
 .situation, .story, .final, .empty { margin: 0; }
 .situation, .final { color: var(--muted); font-size: var(--text-xs); }
 .call { margin: 0; padding-left: var(--space-3); border-left: 3px solid var(--border); }
 .call p { margin: 0; max-width: 56ch; font: italic 700 1.125rem/1.2 'Barlow Condensed', sans-serif; letter-spacing: .005em; }
 .story { max-width: 64ch; color: var(--muted); font-size: var(--text-xs); line-height: 1.5; }
 .expectancy { margin: 0; padding-top: var(--space-3); border-top: 1px solid var(--border); font-weight: 750; font-variant-numeric: tabular-nums; }
 .expectancy small { margin-left: var(--space-2); font-size: var(--text-sm); }
 @media (min-width: 48rem) {
  .moment-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
 }
 @media (max-width: 30rem) {
  .moment-card { gap: var(--space-3); padding: var(--space-4); }
  .moment-card.has-participant { grid-template-columns: 6.5rem minmax(0, 1fr); }
 }
</style>
