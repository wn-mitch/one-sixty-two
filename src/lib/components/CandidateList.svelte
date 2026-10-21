<script lang="ts">
 import { tick, untrack, type Snippet } from 'svelte';
 import type { BoardSource } from '../game/board-source.ts';
 import { BULLPEN_SLOTS, STARTER_SLOTS, type FieldSlot, type Manifest, type Profile, type RosterSlot, type Slot } from '../game/types.ts';
 import { rankingForSeason } from '../rankings/client.ts';
 import type { WarRankings } from '../rankings/types.ts';
 import { collapseFullRoles, fullRoles, isHitter, mixGroups, rankGroups, warValue } from './candidate-ranking.ts';
 import type { CandidateEntry, CandidateGroup, RankingKind, RankingSort } from './candidate-ranking.ts';
 import { candidateGridMotion, createCandidateGridMotion } from '../cards/grid-motion.ts';
 import PlayerCard from './PlayerCard.svelte';
 import CardBrowser from './CardBrowser.svelte';
 import PoolSkeleton from './skeletons/PoolSkeleton.svelte';
 import Skeleton from './skeletons/Skeleton.svelte';
 import { appSettings } from '../game/settings.svelte.ts';

 /** A hitter position, the whole rotation (SP), the whole bullpen (RP), or every player. */
 type FilterSlot = Slot | 'SP' | 'RP' | 'All';
 const FILTER_GROUPS: Partial<Record<FilterSlot, readonly Slot[]>> = { SP: STARTER_SLOTS, RP: BULLPEN_SLOTS };
 /** The roster slots a filter covers. */
 function filterSlots(option: Exclude<FilterSlot, 'All'>): readonly Slot[] {
  return FILTER_GROUPS[option] ?? [option as Slot];
 }
 function filterFor(slot: FieldSlot): Exclude<FilterSlot, 'All'> {
  return (STARTER_SLOTS as readonly FieldSlot[]).includes(slot) ? 'SP' : slot === 'CL' || slot.startsWith('RP') ? 'RP' : slot as Slot;
 }

 let {
  profiles,
  source,
  manifest,
  rankings,
  rankingLoading,
  rankingError,
  onRetryRankings,
  busy,
  selectedSeasonId,
  selectedSeasons,
  previewing = false,
  wide,
  onSelect,
  onPlace,
  onSeasonChange,
  onResetBrowse,
  caption
 }: {
  profiles: readonly Profile[];
  source: BoardSource;
  manifest: Manifest;
  rankings: WarRankings | null;
  rankingLoading: boolean;
  rankingError: boolean;
  onRetryRankings: () => void;
  busy: boolean;
  selectedSeasonId: string | null;
  selectedSeasons: Map<string, string>;
  /** The selected season is shown on the field as a placement preview. */
  previewing?: boolean;
  wide: boolean;
  onSelect: (seasonId: string, seasons: Profile[], trigger: HTMLButtonElement) => void;
  onPlace?: (seasonId: string, seasons: Profile[], slot: FieldSlot | null, trigger: HTMLButtonElement) => void;
  onSeasonChange: (playerId: string, seasonId: string) => void;
  onResetBrowse: () => void;
  /** Lines a mode prints under each offered card, such as Draft Mode's salary and finish. */
  caption?: Snippet<[Profile]>;
 } = $props();

 interface CandidateMotionState {
  draftKey: string;
  count: number;
  filter: FilterSlot;
  sort: string;
  rankings: WarRankings | null;
 }
 const uid = $props.id();
 const gridMotion = createCandidateGridMotion();
 let candidateMotionState: CandidateMotionState | null = null;
 let filter = $state<FilterSlot>('All');
 let visibleCount = $state(20);
 let sentinel = $state<HTMLDivElement>();
 let flippedPlayerId = $state<string | null>(null);
 const showBlocked = $derived(appSettings.showBlockedCards);
 let browseRevision = $state(0);
 let sort = $state('war');
 /** A mode's own sort, when one is chosen; WAR and OPS / ERA rank through `rankGroups`. */
 const modeSort = $derived(source.sorts.find(option => option.value === sort));
 const rankingSort = $derived<RankingSort>(sort === 'metrics' ? 'metrics' : 'war');
 const candidateIndex = $derived(new Set(source.offer.map(profile => profile.seasonId)));
 const viableSeasonIds = $derived(new Set(source.offer.map(profile => profile.seasonId).filter(seasonId => source.viable(seasonId))));
 function legalSlotsFor(seasonId: string): readonly FieldSlot[] {
  return candidateIndex.has(seasonId) && viableSeasonIds.has(seasonId) ? source.destinations(seasonId) : [];
 }
 const qualificationSlots = $derived.by(() => {
  const found = new Set<RosterSlot>();
  for (const profile of profiles) {
   if (!candidateIndex.has(profile.seasonId)) continue;
   for (const slot of profile.eligibleSlots) found.add(slot);
  }
  // A filled position can take no one new, so it is not offered as a filter; a deep relief slot qualifies closers.
  return source.roster.slots.filter(slot => found.has(slot.startsWith('RP') ? 'CL' : slot as Slot) && !source.roster.placed.has(slot));
 });
 const filterOptions = $derived.by((): FilterSlot[] => ['All', ...new Set(qualificationSlots.map(filterFor))]);
 const activeFilter = $derived(filterOptions.includes(filter) ? filter : 'All');
 const groupsBeforeFilter = $derived.by(() => {
  const entries: CandidateEntry[] = [];
  for (const profile of profiles) {
   if (!candidateIndex.has(profile.seasonId)) continue;
   entries.push({ profile, slots: profile.eligibleSlots });
  }
  return rankGroups(entries, rankingSort, rankings, source.groupSeasons);
 });
 const visibleGroups = $derived.by(() => groupsBeforeFilter.filter(group =>
  showBlocked ||
  group.entries.some(entry => viableSeasonIds.has(entry.profile.seasonId)) ||
  group.entries.some(entry => entry.profile.seasonId === selectedSeasonId)
 ));
 const groups = $derived.by(() => {
  let filtered = visibleGroups;
  if (activeFilter !== 'All') {
   const entries = visibleGroups.flatMap(group => group.entries
    .filter(entry => profileMatchesFilter(entry.profile, activeFilter))
    .map(entry => ({ profile: entry.profile, slots: filterSlots(activeFilter as Exclude<FilterSlot, 'All'>) })));
   filtered = rankGroups(entries, rankingSort, rankings, source.groupSeasons);
  }
  // Hitters and pitchers share one ranking, led by each player's default season, so choosing another exact
  // season never moves the card out from under the player.
  const mixed = modeSort
   ? [...filtered].sort((a, b) => modeSort.compare(defaultEntry(a).profile, defaultEntry(b).profile))
   : mixGroups(filtered, rankingSort, rankings, defaultEntry);
  // When shown, blocked players follow every player who can still be placed on phones.
  return wide ? mixed : [...mixed].sort((a, b) => Number(isBlocked(a)) - Number(isBlocked(b)));
 });
 const openSlots = $derived(source.roster.slots.filter(slot => !source.roster.placed.has(slot)));
 // A role with no open slot folds its unplaceable players away below the ranking; a bench takes anyone, so none fold there.
 const roleSplit = $derived(collapseFullRoles(groups, source.roster.bench ? new Set() : fullRoles(openSlots), group =>
  !isBlocked(group) || group.entries.some(entry => entry.profile.seasonId === selectedSeasonId)
 ));
 const filterCounts = $derived.by(() => new Map(filterOptions
  .filter((option): option is Exclude<FilterSlot, 'All'> => option !== 'All')
  .map(option => [option, visibleGroups.filter(group => group.entries.some(entry => profileMatchesFilter(entry.profile, option))).length])));
 const blockedGroupCount = $derived(groupsBeforeFilter.filter(group =>
  group.entries.every(entry => !viableSeasonIds.has(entry.profile.seasonId)) &&
  (activeFilter === 'All' || group.entries.some(entry => profileMatchesFilter(entry.profile, activeFilter)))
 ).length);
 const rankedGroups = $derived(roleSplit.shown);
 const collapsedGroups = $derived(roleSplit.collapsed);
 const shownGroups = $derived(rankedGroups.slice(0, visibleCount));
 const hasMore = $derived(shownGroups.length < rankedGroups.length);
 const collapsedLabel = $derived.by(() => {
  const kinds = new Set(collapsedGroups.map(group => group.kind));
  const role = kinds.size === 2 ? 'Roster full' : kinds.has('Pitchers') ? 'Pitching staff full' : 'Lineup full';
  return `${role} · ${collapsedGroups.length} ${collapsedGroups.length === 1 ? 'player' : 'players'}`;
 });
 const draftBrowseKey = $derived(source.key);

 function selectedEntry(group: CandidateGroup): CandidateEntry {
  const preferred = selectedSeasonId && group.entries.some(entry => entry.profile.seasonId === selectedSeasonId)
   ? selectedSeasonId
   : selectedSeasons.get(group.playerId);
  if (preferred) {
   const remembered = group.entries.find(entry => entry.profile.seasonId === preferred);
   if (remembered) return remembered;
  }
  return defaultEntry(group);
 }
 /** The season a card shows before the player picks one. */
 function defaultEntry(group: CandidateGroup): CandidateEntry {
  return (wide ? group.entries.find(entry => viableSeasonIds.has(entry.profile.seasonId)) : undefined) ?? group.entries[0];
 }
 function isBlocked(group: CandidateGroup): boolean {
  return group.entries.every(entry => !viableSeasonIds.has(entry.profile.seasonId));
 }
 function cardRankingKind(profile: Profile): RankingKind {
  return profile.eligibleSlots.some(isHitter) ? 'Hitters' : 'Pitchers';
 }
 function profileMatchesFilter(profile: Profile, option: FilterSlot): boolean {
  return option === 'All' || filterSlots(option).some(slot => profile.eligibleSlots.includes(slot));
 }
 function changeSeason(group: CandidateGroup, seasonId: string) {
  if (group.entries.some(entry => entry.profile.seasonId === seasonId)) onSeasonChange(group.playerId, seasonId);
 }
 function resetBrowse() {
  visibleCount = 20;
  flippedPlayerId = null;
  onResetBrowse();
 }
 /** Set by a sort or filter change so the grid gathers and re-sorts instead of reflowing. */
 let gatherNext = false;
 function reshuffle(change: () => void): void {
  gatherNext = true;
  change();
  resetBrowse();
 }

 function selectSeason(seasonId: string, group: CandidateGroup, trigger: HTMLButtonElement) {
  flippedPlayerId = null;
  onSelect(seasonId, group.entries.map(item => item.profile), trigger);
 }
 function placeSeason(seasonId: string, group: CandidateGroup, slot: FieldSlot | null, trigger: HTMLButtonElement) {
  flippedPlayerId = null;
  onPlace?.(seasonId, group.entries.map(item => item.profile), slot, trigger);
 }
 async function loadMore(focusNew = false): Promise<void> {
  if (busy || !hasMore) return;
  const firstNew = rankedGroups[shownGroups.length]?.key;
  visibleCount += 20;
  if (!focusNew || !firstNew) return;
  await tick();
  document.querySelector<HTMLButtonElement>(`[data-candidate-group="${CSS.escape(firstNew)}"] button.select-front, [data-candidate-group="${CSS.escape(firstNew)}"] button.art-trigger`)?.focus({ preventScroll: true });
 }
 $effect(() => {
  if (!sentinel || busy || !hasMore || typeof IntersectionObserver === 'undefined') return;
  visibleCount;
  const observer = new IntersectionObserver(entries => {
   // Keyboard focus on the fallback owns this batch; never remove its button underneath Enter.
   if (entries.some(entry => entry.isIntersecting) && !sentinel?.contains(document.activeElement)) void loadMore();
  }, { rootMargin: '400px 0px' });
  observer.observe(sentinel);
  return () => observer.disconnect();
 });
 function playerCardFromTarget(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest('[data-candidate-card]') : null;
 }
 function closeFlipIfOutside(target: EventTarget | null) {
  if (!flippedPlayerId) return;
  const card = playerCardFromTarget(target);
  if (card?.getAttribute('data-candidate-card') !== flippedPlayerId) flippedPlayerId = null;
 }
 function handlePointerDown(event: PointerEvent) {
  closeFlipIfOutside(event.target);
 }
 function handleFocusIn(event: FocusEvent) {
  closeFlipIfOutside(event.target);
 }
 $effect(() => {
  draftBrowseKey;
  untrack(() => {
   flippedPlayerId = null;
   visibleCount = 20;
   browseRevision++;
  });
 });
 $effect(() => {
  if (!wide) flippedPlayerId = null;
 });
 // Rankings may move a selected player beyond the revealed prefix; reveal through their new position.
 $effect(() => {
  rankings;
  untrack(() => {
   if (!selectedSeasonId) return;
   const index = rankedGroups.findIndex(group => group.entries.some(entry => entry.profile.seasonId === selectedSeasonId));
   if (index >= 0) visibleCount = Math.max(visibleCount, Math.ceil((index + 1) / 20) * 20);
  });
 });
 $effect.pre(() => {
  const next: CandidateMotionState = {
   draftKey: draftBrowseKey,
   count: shownGroups.length,
   filter: activeFilter,
   sort,
   rankings
  };
  const previous = candidateMotionState;
  candidateMotionState = next;
  if (!previous) {
   gridMotion.skip();
   return;
  }
  const reordered = next.filter !== previous.filter ||
   next.sort !== previous.sort ||
   next.rankings !== previous.rankings;
  const gather = gatherNext;
  gatherNext = false;
  if (next.draftKey !== previous.draftKey || !reordered) {
   if (next.draftKey !== previous.draftKey || next.count !== previous.count) gridMotion.skip();
   return;
  }
  const revision = gridMotion.capture();
  void tick().then(() => gridMotion.play(revision, gather ? 'gather' : 'reflow'));
 });
</script>

{#snippet candidateCard(group: CandidateGroup)}
    {@const entry = selectedEntry(group)}
    {@const profile = entry.profile}
    {@const directSlots = legalSlotsFor(profile.seasonId)}
    {@const cardKind = cardRankingKind(profile)}
    <div
     class="candidate-card"
     data-candidate-group={group.key}
     data-candidate-card={group.key}
     data-selected={selectedSeasonId === profile.seasonId}
     data-previewing={previewing && selectedSeasonId === profile.seasonId}
     data-flipped={flippedPlayerId === group.key}
     data-blocked={!wide && isBlocked(group)}
    >
     <PlayerCard
      {profile}
      seasons={group.entries.map(item => item.profile)}
      onSeasonChange={source.groupSeasons ? seasonId => changeSeason(group, seasonId) : undefined}
      legalSlots={directSlots}
      bench={source.viable(profile.seasonId) && source.benches(profile.seasonId)}
      onPlace={(slot, trigger) => placeSeason(profile.seasonId, group, slot, trigger)}
      war={warValue({ profile, slots: profile.eligibleSlots }, cardKind, rankings)}
      ranking={rankingForSeason(rankings, profile.seasonId)}
      {rankings}
      {manifest}
      {rankingLoading}
      {rankingError}
      selected={selectedSeasonId === profile.seasonId}
      draftMode
      {wide}
      bind:turned={() => flippedPlayerId === group.key, value => flippedPlayerId = value ? group.key : null}
      onSelect={trigger => selectSeason(profile.seasonId, group, trigger)}
     />
     {#if caption}{@render caption(profile)}{/if}
    </div>
{/snippet}

<svelte:window onpointerdown={handlePointerDown} onfocusin={handleFocusIn} />
<div use:candidateGridMotion={gridMotion} class:candidates-wide={wide} class="candidates">
<CardBrowser label="Choose a historical player season" {wide} {busy} searchable={false}
 sorts={[{ value: 'war', label: 'WAR' }, { value: 'metrics', label: 'OPS / ERA' }, ...source.sorts.map(({ value, label }) => ({ value, label }))]} {sort} onSort={value => reshuffle(() => sort = value)}
 filters={filterOptions.map(option => ({ value: option, count: option === 'All' ? visibleGroups.length : filterCounts.get(option) ?? 0 }))}
 filter={activeFilter} filterLegend="Qualifies for position" filterToggle="Positions" onFilter={value => reshuffle(() => filter = value as FilterSlot)}
 resultsId="{uid}-results">
 {#snippet rail()}
  {#if rankingLoading}
   <!-- A small spinner says rankings are on the way; the full explanation is for screen readers and the tooltip. -->
   {@const rankingNote = `Loading composite WAR/162.${sort === 'war' ? ' Cards are in stable ID order until it arrives. Sort by OPS / ERA to rank by those stats now.' : ''} Drafting is available.`}
   <p class="ranking-status ranking-loading muted" role="status" title={rankingNote}><span class="ranking-spinner" aria-hidden="true"></span><span aria-hidden="true">Ranking WAR</span><span class="sr-only">{rankingNote}</span></p>
  {:else if rankingError}
   <div class="ranking-status">
    <p role="status">Composite WAR/162 is unavailable.{sort === 'war' ? ' Cards are in stable ID order, not ranked by WAR. Sort by OPS / ERA or retry.' : ''} You can still draft.</p>
    <button type="button" class="secondary" onclick={onRetryRankings}>Retry rankings</button>
   </div>
  {/if}
 {/snippet}

  {#if source.waiting}
   <p class="notice">{source.waiting}</p>
  {:else if groups.length === 0 && !showBlocked && blockedGroupCount > 0}
   <p class="notice">These players have no open position. Turn on Blocked players in Settings to select one and make room on your field.</p>
  {:else if groups.length === 0}
   {#if activeFilter !== 'All'}
    <div class="empty">
     <h3>No players for this position.</h3>
     <p class="muted">Browse all historical qualifications.</p>
     <button type="button" class="secondary" disabled={busy} onclick={() => { filter = 'All'; resetBrowse(); }}>Show all positions</button>
    </div>
   {:else if busy}
    <Skeleton label="Loading the player pool…"><PoolSkeleton {wide} rail={false} /></Skeleton>
   {:else}
    <p class="notice">No eligible seasons are available in this pool. Your current roll is preserved.</p>
   {/if}
  {:else}
   {#if shownGroups.length}
   <section class="player-section" aria-label="Players">
    <div class="section-heading">
     <h3>Players</h3>
    </div>
    <div class="card-grid">
     {#each shownGroups as group (`${browseRevision}:${group.key}`)}
      {@render candidateCard(group)}
     {/each}
    </div>
   </section>
   {/if}
   {#if rankedGroups.length}
    <div class="pool-more" data-pool-load bind:this={sentinel}>
     <span role="status">{shownGroups.length} of {rankedGroups.length} players</span>
     {#if hasMore}<button type="button" class="secondary" disabled={busy} onclick={() => loadMore(true)}>Load more players</button>{/if}
    </div>
   {/if}
   {#if collapsedGroups.length && !hasMore}
    <details class="collapsed-role">
     <summary>{collapsedLabel}</summary>
     <div class="card-grid">
      {#each collapsedGroups as group (`${browseRevision}:${group.key}`)}
       {@render candidateCard(group)}
      {/each}
     </div>
    </details>
   {/if}
  {/if}
</CardBrowser>
</div>

<style>
 .candidates { min-width: 0; }
 .section-heading { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); align-items: baseline; justify-content: space-between; margin-block: var(--space-6) var(--space-3); }
 /* On phones the first section sits right under the filters. */
 .candidates:not(.candidates-wide) .player-section:first-of-type .section-heading { margin-top: var(--space-3); }
 .section-heading h3 { font-size: var(--text-lg); }
 .card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 10px; align-items: start; }
 .candidate-card { display: grid; gap: var(--space-2); width: 100%; max-width: 24rem; min-width: 0; margin-inline: auto; }
 /* A player with no open position stays browsable but reads as unavailable. */
 .candidate-card[data-blocked='true']:not([data-selected='true']) { opacity: .5; filter: grayscale(.85); }
 .candidates:has(.candidate-card[data-selected='true']) .candidate-card:not([data-selected='true']) :global(.art-frame) { opacity: .56; }
 /* The previewed card already sits on the field, so its source steps back slightly. */
 .candidate-card[data-previewing='true'] :global(.art-frame) { opacity: .7; transition: opacity .18s ease-out; }
 /* A role with no open slot folds into one quiet line under the ranking; opening it shows the cards dimmed. */
 .collapsed-role { margin-top: var(--space-6); border-top: 1px solid var(--border); }
 .collapsed-role > summary { display: flex; align-items: center; min-height: 44px; color: var(--muted); font-size: var(--text-sm); font-weight: 650; cursor: pointer; }
 .collapsed-role[open] > summary { margin-bottom: var(--space-3); }
 .collapsed-role .candidate-card:not([data-selected='true']) { opacity: .5; filter: grayscale(.85); }
 .empty { padding-block: var(--space-4) var(--space-8); }
 .ranking-status { font-size: var(--text-sm); }
 .ranking-loading { display: inline-flex; align-items: center; gap: var(--space-2); margin: 0; font-size: var(--text-xs); font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
 .ranking-spinner { width: .85rem; height: .85rem; border: 2px solid color-mix(in oklch, currentColor 25%, transparent); border-top-color: currentColor; border-radius: 50%; animation: ranking-spin 800ms linear infinite; }
 @keyframes ranking-spin { to { rotate: 1turn; } }
 :global([data-motion='off']) .ranking-spinner { animation: none; border-top-color: color-mix(in oklch, currentColor 25%, transparent); border-right-color: currentColor; }
 @media (prefers-reduced-motion: reduce) { .ranking-spinner { animation: none; border-right-color: currentColor; } }
 .pool-more { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-6); color: var(--muted); font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
 .pool-more button { min-height: 44px; }
 @media (min-width: 48rem) {
  /* The first heading lines up with Your field: the panel's border plus its header padding. */
  .candidates-wide .player-section:first-of-type .section-heading { margin-top: calc(1rem + 1px); }
  .candidates-wide .section-heading h3 { font: italic 900 1.5rem/1 'Barlow Condensed', sans-serif; text-transform: uppercase; }
  .candidates-wide .card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 20px; grid-auto-flow: dense; }
 }
 /* Phones in portrait keep two columns, so each card's game text stays readable; small tablets fit three. */
 @media (min-width: 30rem) and (max-width: 47.999rem) {
  .card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 10px; }
 }
 @media (min-width: 48rem) and (max-width: 1099px) {
  .candidates:not(.candidates-wide) .card-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
 }
 @media (min-width: 1360px) {
  .candidates-wide .card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
 }
</style>
