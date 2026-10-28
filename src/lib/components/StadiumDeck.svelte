<script lang="ts">
 import { onMount, tick, untrack } from 'svelte';
 import { flip } from 'svelte/animate';
 import { cubicOut } from 'svelte/easing';
 import { SvelteSet } from 'svelte/reactivity';
 import { appSettings } from '#lib/game/settings.svelte.ts';
 import { loadStadiumPreferences, orderStadiums, saveStadiumPreferences, type StadiumSort } from '#lib/game/stadium-preferences.ts';
 import type { Manifest } from '#lib/game/types.ts';
 import { MOTION } from '#lib/motion-timing.ts';
 import { toasts } from '#lib/toast.svelte.ts';
 import { clearStage, stash } from './phase-motion.ts';
 import VenueCard from './VenueCard.svelte';
 import GuideTip from './GuideTip.svelte';
 import WinChart from './WinChart.svelte';
 import { loadParkSummaries, type ParkSummary } from '#lib/game/stadium-standings.ts';
 import { MIN_RUNS } from '#lib/game/win-distribution.ts';

 let { manifest, busy, initialSelected = '', onSelect }: { manifest: Manifest; busy: boolean; initialSelected?: string; onSelect: (stadiumId: string) => void } = $props();
 let selected = $state(untrack(() => initialSelected));
 /** Other players' records at each park; absent until loaded, and for parks with too few runs to describe. */
 let parks = $state.raw<ReadonlyMap<string, ParkSummary>>(new Map());
 onMount(() => {
  let live = true;
  void loadParkSummaries(location.origin).then(value => { if (live) parks = value; }).catch(() => {});
  return () => { live = false; };
 });
 const franchiseName = (id: string) => manifest.franchises.find(franchise => franchise.id === id)?.name ?? id;
 const saved = loadStadiumPreferences();
 let sort = $state<StadiumSort>(saved.sort);
 const favorites = new SvelteSet(saved.favorites);
 const ordered = $derived(orderStadiums(manifest.stadiums, sort, favorites, franchiseName));
 let query = $state('');
 // Search narrows by park or team; the chosen park always stays in the deck.
 const needle = $derived(query.trim().toLocaleLowerCase());
 const matches = (stadium: Manifest['stadiums'][number]) => `${stadium.name} ${franchiseName(stadium.franchiseId)}`.toLocaleLowerCase().includes(needle);
 const matchCount = $derived(needle ? ordered.filter(matches).length : ordered.length);
 const stadiums = $derived(needle ? ordered.filter(stadium => stadium.ref.id === selected || matches(stadium)) : ordered);
 const reorder = () => ({ duration: appSettings.effectiveEnabled ? MOTION.deckReorder / (appSettings.snapshot.cardSpeed || 1) : 0, easing: cubicOut });

 function persist(): void {
  if (!saveStadiumPreferences({ sort, favorites: [...favorites] })) toasts.show('Favorites and sort will reset next visit: browser storage is unavailable.', { id: 'stadium-preferences', tone: 'error' });
 }

 function setSort(next: StadiumSort): void {
  sort = next;
  persist();
 }

 function toggleFavorite(id: string): void {
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  persist();
 }
 const chosen = $derived(ordered.find(stadium => stadium.ref.id === selected));
 let deck = $state<HTMLElement>();
 let leaving = $state(false);

 /** The rest of the deck clears around the chosen park, whose card then travels onto the draft field. */
 async function choose(): Promise<void> {
  if (!selected || busy || leaving || !deck) return;
  const id = selected;
  leaving = true;
  const others = [...deck.querySelectorAll<HTMLElement>('.choice-wrap:not(:has(.choice.selected))')];
  const chrome = [...deck.querySelectorAll<HTMLElement>(':scope > h2, :scope > .intro, :scope > .deck-tools, .commit, .choice-wrap:has(.choice.selected) .favorite, .choice-wrap:has(.choice.selected) .park-record')];
  const exit = await clearStage(others, chrome);
  const card = deck.querySelector<HTMLElement>('.choice.selected .venue-card');
  if (card) stash('stadium', new Map([['card', card.getBoundingClientRect()]]), new Map([['card', card.cloneNode(true) as HTMLElement]]));
  onSelect(id);
  await tick();
  leaving = false;
  // Still mounted means the choice did not land; the session reports why.
  if (deck?.isConnected) for (const animation of exit) animation.cancel();
 }
</script>

<section bind:this={deck} class="stadium-deck" aria-labelledby="stadium-heading" inert={leaving}>
 <h2 id="stadium-heading" tabindex="-1">Choose your home stadium</h2>
 <p class="intro muted">You play 81 of your 162 games here. Its fences and altitude change how far the ball carries, for both teams.</p>
 <GuideTip step="stadium" anchor={() => deck?.querySelector<HTMLElement>('.choice-wrap')} text="Your goal: draft a team from baseball history that wins all 162 games. Start by tapping any park to make it your home." />
 <div class="deck-tools">
  <label class="search"><span class="sr-only">Find a stadium by park or team</span>
   <input type="search" placeholder="Find a park or team" autocomplete="off" bind:value={query} />
  </label>
  <div class="sort-toggle" role="group" aria-label="Sort stadiums by">
   <button type="button" aria-pressed={sort === 'stadium'} onclick={() => setSort('stadium')}>Stadium</button>
   <button type="button" aria-pressed={sort === 'team'} onclick={() => setSort('team')}>Team</button>
  </div>
  <p class="muted">{favorites.size ? `${favorites.size} favorite${favorites.size === 1 ? '' : 's'} pinned first` : 'Star a park to pin it first'}</p>
 </div>
 <form onsubmit={event => { event.preventDefault(); void choose(); }}>
  <fieldset>
   <legend class="sr-only">Home stadium</legend>
   {#if needle && !matchCount}<p class="muted no-match" role="status">No park or team matches “{query.trim()}”.</p>{/if}
   <div class="grid">
    {#each stadiums as stadium (stadium.ref.id)}
     {@const favorite = favorites.has(stadium.ref.id)}
     {@const park = parks.get(stadium.ref.id)}
     <div class="choice-wrap" animate:flip={reorder()}>
      <label class="choice" class:selected={selected === stadium.ref.id}>
       <input type="radio" name="stadium" value={stadium.ref.id} bind:group={selected} disabled={busy} />
       <VenueCard {stadium} franchiseName={franchiseName(stadium.franchiseId)} />
       {#if park && park.total >= MIN_RUNS}
        <span class="park-record"><WinChart distribution={park.distribution} subject={`Runs at ${stadium.name}`} spark /><span>Typical {park.typical} W</span><span>Top 10% {park.top10}+ W</span></span>
       {/if}
      </label>
      <button type="button" class="favorite" class:on={favorite} aria-pressed={favorite} aria-label={`Favorite ${stadium.name}`} onclick={() => toggleFavorite(stadium.ref.id)}>
       <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false"><path d="M8 1.6l1.9 4 4.3.5-3.2 3 .9 4.3L8 11.2l-3.9 2.2.9-4.3-3.2-3 4.3-.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"></path></svg>
      </button>
     </div>
    {/each}
   </div>
  </fieldset>
  <div class="commit">
   <p class="muted" aria-live="polite">{chosen ? chosen.name : 'No stadium selected'}</p>
   <button class="primary" type="submit" disabled={busy || !selected}>Draft at this stadium</button>
  </div>
 </form>
</section>

<style>
 .stadium-deck { display: grid; gap: var(--space-4); padding-bottom: var(--space-16); }
 h2 { margin: 0; font-size: var(--text-2xl); }
 .intro { margin: 0; max-width: 68ch; }
 fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
 .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
 @media (min-width: 48rem) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
 @media (min-width: 72rem) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
 .grid { gap: var(--space-5) var(--space-4); }
 .deck-tools { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-4); }
 .deck-tools p { margin: 0; font-size: var(--text-sm); }
 .search { flex: 1 1 14rem; max-width: 22rem; }
 .search input { position: static; width: 100%; height: auto; min-height: 2.75rem; opacity: 1; pointer-events: auto; padding-inline: var(--space-3); }
 .no-match { margin: 0 0 var(--space-3); }
 .sort-toggle { display: inline-flex; padding: 2px; border: 1px solid var(--border); border-radius: 999px; }
 .sort-toggle button { min-height: 2.5rem; padding: 0 var(--space-4); border: 0; border-radius: 999px; background: transparent; color: var(--muted); font-size: var(--text-sm); }
 .sort-toggle button[aria-pressed='true'] { background: var(--text); color: var(--background); }
 .choice-wrap { position: relative; min-width: 0; }
 .favorite { position: absolute; z-index: 1; top: .6rem; left: .6rem; display: grid; place-items: center; width: 44px; height: 44px; min-height: 0; padding: 0; border: 0; border-radius: 50%; color: var(--text); background: oklch(17% .012 255 / .72); }
 .favorite svg { fill: none; }
 .favorite.on { color: var(--accent); }
 .favorite.on svg { fill: currentColor; }
 .favorite:hover:not(:disabled) { background: oklch(24% .012 255 / .88); }
 .favorite:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
 .choice { position: relative; display: block; min-width: 0; border-radius: calc(var(--radius-lg) + 4px); cursor: pointer; transition: transform 180ms var(--ease-out); }
 .choice:hover { transform: translateY(-2px); }
 .choice.selected { outline: 3px solid var(--accent); outline-offset: 4px; }
 .choice.selected::after { content: 'Selected'; position: absolute; top: -.6rem; left: .75rem; padding: .1rem .5rem; border-radius: var(--radius); color: var(--background); background: var(--accent); font-size: var(--text-xs); font-weight: 750; letter-spacing: .04em; }
 .choice:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: 4px; }
 input { position: absolute; width: 1px; height: 1px; margin: 0; opacity: 0; pointer-events: none; }
 /*
  * Firefox on iOS can pin bottom-sticky content above the full height of its collapsed toolbar, leaving cards
  * scrolling through the gap below the bar. The offset shadow paints the page background into that gap; at the
  * end of the deck it only covers the deck's own bottom padding.
  */
 .commit { position: sticky; z-index: 2; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) 0 calc(var(--space-3) + env(safe-area-inset-bottom)); background: var(--background); border-top: 1px solid var(--border); margin-top: var(--space-4); box-shadow: 0 var(--space-16) 0 0 var(--background); }
 .commit p { margin: 0; }
 .park-record { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0 var(--space-2); margin-top: var(--space-2); color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
 .park-record > span:not(:first-child) { white-space: nowrap; }
</style>
