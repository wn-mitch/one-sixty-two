<script lang="ts">
 import { tick, untrack } from 'svelte';
 import { availableCandidates, legalSlots } from '../game/draft.ts';
 import { draftRules } from '../game/rules.ts';
 import type { Draft, Manifest, Profile, RosterSlot, Slot } from '../game/types.ts';
 import { rankingForSeason } from '../rankings/client.ts';
 import type { WarRankings } from '../rankings/types.ts';
 import { compareEntries, isHitter, rankGroups, warValue } from './candidate-ranking.ts';
 import type { CandidateEntry, CandidateGroup, RankingKind, RankingSort } from './candidate-ranking.ts';
 import { candidateGridMotion, createCandidateGridMotion } from '../cards/grid-motion.ts';
 import PlayerCard from './PlayerCard.svelte';
 import { appSettings } from '../game/settings.svelte.ts';

 type FilterSlot = Slot | 'All';

 let {
  profiles,
  draft,
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
  onResetBrowse
 }: {
  profiles: Profile[];
  draft: Draft;
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
  onPlace?: (seasonId: string, seasons: Profile[], slot: Slot, trigger: HTMLButtonElement) => void;
  onSeasonChange: (playerId: string, seasonId: string) => void;
  onResetBrowse: () => void;
 } = $props();

 interface CandidateMotionState {
  draftKey: string;
  page: number;
  query: string;
  filter: FilterSlot;
  sort: RankingSort;
  rankings: WarRankings | null;
 }
 const uid = $props.id();
 const gridMotion = createCandidateGridMotion();
 let candidateMotionState: CandidateMotionState | null = null;
 let query = $state('');
 let filter = $state<FilterSlot>('All');
 let page = $state(0);
 let flippedPlayerId = $state<string | null>(null);
 const showBlocked = $derived(appSettings.showBlockedCards);
 let browseRevision = $state(0);
 let sort = $state<RankingSort>('war');
 let filtersOpen = $state(false);
 const manifestBySeason = $derived(new Map(manifest.candidates.map(candidate => [candidate.seasonId, candidate])));
 const usedPlayerIds = $derived(new Set(draft.picks.map(pick => manifestBySeason.get(pick.seasonId)?.playerId).filter((id): id is string => !!id)));
 const usedFranchises = $derived(new Set(draft.picks.map(pick => pick.franchiseId)));
 const candidates = $derived(draft.currentRoll
  ? manifest.candidates.filter(candidate =>
   candidate.franchiseId === draft.currentRoll!.franchiseId &&
   candidate.decade === draft.currentRoll!.decade &&
   !usedPlayerIds.has(candidate.playerId) &&
   !usedFranchises.has(candidate.franchiseId)
  )
  : []);
 const candidateIndex = $derived(new Map(candidates.map(candidate => [candidate.seasonId, candidate])));
 const viableSeasonIds = $derived(new Set(availableCandidates(draft, manifest).map(candidate => candidate.seasonId)));
 function legalSlotsFor(seasonId: string): readonly Slot[] {
  const candidate = candidateIndex.get(seasonId);
  return candidate && viableSeasonIds.has(seasonId) ? legalSlots(draft, candidate, manifest) : [];
 }
 const qualificationSlots = $derived.by(() => {
  const found = new Set<RosterSlot>();
  for (const profile of profiles) {
   if (!candidateIndex.has(profile.seasonId)) continue;
   for (const slot of profile.eligibleSlots) found.add(slot);
  }
  // A filled position can take no one new, so it is not offered as a filter.
  const filled = new Set(draft.picks.map(pick => pick.slot));
  return draftRules(draft.schemaVersion).slots.filter(slot => found.has(slot) && !filled.has(slot));
 });
 const filterOptions = $derived.by((): FilterSlot[] => ['All', ...qualificationSlots]);
 const activeFilter = $derived(filterOptions.includes(filter) ? filter : 'All');
 const groupsBeforeFilter = $derived.by(() => {
  const entries: CandidateEntry[] = [];
  const needle = query.trim().toLowerCase();
  for (const profile of profiles) {
   if (!candidateIndex.has(profile.seasonId)) continue;
   if (needle && !`${profile.displayName} ${profile.year} ${profile.historicalTeam}`.toLowerCase().includes(needle)) continue;
   entries.push({ profile, slots: profile.eligibleSlots });
  }
  return rankGroups(entries, sort, rankings);
 });
 const visibleGroups = $derived.by(() => groupsBeforeFilter.filter(group =>
  !wide ||
  showBlocked ||
  group.entries.some(entry => viableSeasonIds.has(entry.profile.seasonId)) ||
  group.entries.some(entry => entry.profile.seasonId === selectedSeasonId)
 ));
 const groups = $derived.by(() => {
  let filtered = visibleGroups;
  if (activeFilter !== 'All') {
   const entries = visibleGroups.flatMap(group => group.entries
    .filter(entry => profileMatchesFilter(entry.profile, activeFilter))
    .map(entry => ({ profile: entry.profile, slots: [activeFilter] })));
   filtered = rankGroups(entries, sort, rankings);
  }
  // Phones keep blocked players in the grid but after every player who can still be placed.
  return [...filtered].sort((a, b) => sectionKinds.indexOf(a.kind) - sectionKinds.indexOf(b.kind)
   || (wide ? 0 : Number(isBlocked(a)) - Number(isBlocked(b)))
   || compareEntries(selectedEntry(a), selectedEntry(b), a.kind, sort, rankings));
 });
 const filterCounts = $derived.by(() => new Map(filterOptions
  .filter((option): option is Slot => option !== 'All')
  .map(option => [option, visibleGroups.filter(group => group.entries.some(entry => profileMatchesFilter(entry.profile, option))).length])));
 const blockedGroupCount = $derived(groupsBeforeFilter.filter(group =>
  group.entries.every(entry => !viableSeasonIds.has(entry.profile.seasonId)) &&
  (activeFilter === 'All' || group.entries.some(entry => profileMatchesFilter(entry.profile, activeFilter)))
 ).length);
 const pageCount = $derived(Math.max(1, Math.ceil(groups.length / 20)));
 const currentPage = $derived(Math.min(page, pageCount - 1));
 const pagedGroups = $derived(groups.slice(currentPage * 20, (currentPage + 1) * 20));
 const sectionKinds: RankingKind[] = ['Hitters', 'Pitchers'];
 const sections = $derived(sectionKinds.map(kind => ({ kind, groups: pagedGroups.filter(group => group.kind === kind) })));
 const draftBrowseKey = $derived(`${draft.schemaVersion}:${draft.dataVersion}:${draft.seed}:${draft.picks.map(pick => pick.seasonId).join('|')}:${draft.currentRoll?.franchiseId ?? ''}:${draft.currentRoll?.decade ?? ''}`);

 function selectedEntry(group: CandidateGroup): CandidateEntry {
  const preferred = selectedSeasonId && group.entries.some(entry => entry.profile.seasonId === selectedSeasonId)
   ? selectedSeasonId
   : selectedSeasons.get(group.playerId);
  if (preferred) {
   const remembered = group.entries.find(entry => entry.profile.seasonId === preferred);
   if (remembered) return remembered;
  }
  return (wide ? group.entries.find(entry => viableSeasonIds.has(entry.profile.seasonId)) : undefined) ?? group.entries[0];
 }
 function isBlocked(group: CandidateGroup): boolean {
  return group.entries.every(entry => !viableSeasonIds.has(entry.profile.seasonId));
 }
 function cardRankingKind(profile: Profile): RankingKind {
  return profile.eligibleSlots.some(isHitter) ? 'Hitters' : 'Pitchers';
 }
 function profileMatchesFilter(profile: Profile, option: FilterSlot): boolean {
  return option === 'All' || profile.eligibleSlots.includes(option);
 }
 function changeSeason(group: CandidateGroup, seasonId: string) {
  if (group.entries.some(entry => entry.profile.seasonId === seasonId)) onSeasonChange(group.playerId, seasonId);
 }
 function resetBrowse() {
  page = 0;
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
 function placeSeason(seasonId: string, group: CandidateGroup, slot: Slot, trigger: HTMLButtonElement) {
  flippedPlayerId = null;
  onPlace?.(seasonId, group.entries.map(item => item.profile), slot, trigger);
 }
 async function changePage(next: number) {
  page = next;
  flippedPlayerId = null;
  onResetBrowse();
  await tick();
  const results = document.getElementById(`${uid}-results`);
  results?.focus({ preventScroll: true });
  results?.scrollIntoView({ block: 'start' });
 }
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
   page = 0;
   browseRevision++;
  });
 });
 $effect(() => {
  if (!wide) flippedPlayerId = null;
 });
 $effect.pre(() => {
  const next: CandidateMotionState = {
   draftKey: draftBrowseKey,
   page: currentPage,
   query,
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
  const reordered = next.query !== previous.query ||
   next.filter !== previous.filter ||
   next.sort !== previous.sort ||
   next.rankings !== previous.rankings;
  const gather = gatherNext;
  gatherNext = false;
  if (next.draftKey !== previous.draftKey || !reordered) {
   if (next.draftKey !== previous.draftKey || next.page !== previous.page) gridMotion.skip();
   return;
  }
  const revision = gridMotion.capture();
  void tick().then(() => gridMotion.play(revision, gather ? 'gather' : 'reflow'));
 });
</script>

<svelte:window onpointerdown={handlePointerDown} onfocusin={handleFocusIn} />
<section use:candidateGridMotion={gridMotion} class:candidates-wide={wide} class="candidates" aria-label="Choose a historical player season" aria-busy={busy}>
 <div class="filter-rail">
  <div class="search-row">
   <label for="{uid}-search" class:sr-only={!wide}>Find your pick</label>
   <span class="search-field">
    <input id="{uid}-search" type="search" placeholder="Search" bind:value={query} oninput={resetBrowse} disabled={busy} />
    {#if query}<button type="button" class="quiet clear-search" aria-label="Clear search" disabled={busy} onclick={() => { query = ''; resetBrowse(); }}>×</button>{/if}
   </span>
   {#if !wide}
    <button type="button" class="secondary filters-toggle" class:active={activeFilter !== 'All'} aria-expanded={filtersOpen} aria-controls="{uid}-filters" onclick={() => filtersOpen = !filtersOpen}>
     Positions{#if activeFilter !== 'All'}<span class="filters-badge">{activeFilter}</span>{/if}
    </button>
   {/if}
  </div>
  <div class="sort-row" role="group" aria-labelledby="{uid}-sort-label">
   <span id="{uid}-sort-label" class="sort-label">Sort by</span>
   <span class="sort-options">
    <button type="button" aria-pressed={sort === 'war'} disabled={busy} onclick={() => { if (sort !== 'war') reshuffle(() => sort = 'war'); }}>WAR</button>
    <button type="button" aria-pressed={sort === 'metrics'} disabled={busy} onclick={() => { if (sort !== 'metrics') reshuffle(() => sort = 'metrics'); }}>OPS / ERA</button>
   </span>
  </div>
  <!-- Phones keep the position filter behind its toggle so the first cards sit near the top. -->
  <div class="filter-panel" id="{uid}-filters" hidden={!wide && !filtersOpen}>
   <fieldset class="filters" disabled={busy}>
    <legend>Qualifies for position</legend>
    <div class="filter-options" role="group" aria-label="Qualifies for position">
     {#each filterOptions as option}
      {@const count = option === 'All' ? visibleGroups.length : filterCounts.get(option) ?? 0}
      <button type="button" class="quiet filter" aria-pressed={activeFilter === option} aria-label={option} onclick={() => { if (activeFilter !== option) reshuffle(() => filter = option); }}>
       <span>{option}</span><span class="filter-count">{count}</span>
      </button>
     {/each}
    </div>
   </fieldset>
  </div>
  {#if rankingLoading}
   <p class="ranking-status muted" role="status">Loading composite WAR/162.{sort === 'war' ? ' Cards are in stable ID order until it arrives. Sort by OPS / ERA to rank by those stats now.' : ''} Drafting is available.</p>
  {:else if rankingError}
   <div class="ranking-status">
    <p role="status">Composite WAR/162 is unavailable.{sort === 'war' ? ' Cards are in stable ID order, not ranked by WAR. Sort by OPS / ERA or retry.' : ''} You can still draft.</p>
    <button type="button" class="secondary" onclick={onRetryRankings}>Retry rankings</button>
   </div>
  {/if}
 </div>
 <div class="candidate-content" id="{uid}-results" tabindex="-1">
  {#if !draft.currentRoll}
   <p class="notice">Roll a franchise and era to open your next player pool.</p>
  {:else if groups.length === 0 && wide && !showBlocked && blockedGroupCount > 0}
   <p class="notice">These players have no open position. Turn on Blocked players in Settings to select one and make room on your field.</p>
  {:else if groups.length === 0}
   {#if query.trim() || activeFilter !== 'All'}
    <div class="empty">
     <h3>No matches for this search.</h3>
     <p class="muted">Try another name or browse all historical qualifications.</p>
     <button type="button" class="secondary" disabled={busy} onclick={() => { query = ''; filter = 'All'; resetBrowse(); }}>Clear search and filters</button>
    </div>
   {:else}
    <p class="notice">{busy ? 'Loading the player pool…' : 'No eligible seasons are available in this pool. Your current roll is preserved.'}</p>
   {/if}
  {:else}
   {#each sections as section}
    {#if section.groups.length}
     <section class="player-section" aria-label={section.kind}>
      <div class="section-heading">
       <h3>{section.kind}</h3>
      </div>
      <div class="card-grid">
       {#each section.groups as group (`${browseRevision}:${group.key}`)}
        {@const entry = selectedEntry(group)}
        {@const profile = entry.profile}
        {@const directSlots = legalSlotsFor(profile.seasonId)}
        {@const cardKind = cardRankingKind(profile)}
        <div
         class="candidate-card"
         data-candidate-group={group.playerId}
         data-candidate-card={group.playerId}
         data-selected={selectedSeasonId === profile.seasonId}
         data-previewing={previewing && selectedSeasonId === profile.seasonId}
         data-flipped={flippedPlayerId === group.playerId}
         data-blocked={!wide && isBlocked(group)}
        >
         <PlayerCard
          {profile}
          seasons={group.entries.map(item => item.profile)}
          onSeasonChange={seasonId => changeSeason(group, seasonId)}
          legalSlots={directSlots}
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
          bind:turned={() => flippedPlayerId === group.playerId, value => flippedPlayerId = value ? group.playerId : null}
          onSelect={trigger => selectSeason(profile.seasonId, group, trigger)}
         />
        </div>
       {/each}
      </div>
     </section>
    {/if}
   {/each}
   {#if pageCount > 1}
    <nav class="pagination" aria-label="Player card pages">
     <button type="button" class="page-button" disabled={busy || currentPage === 0} onclick={() => changePage(currentPage - 1)}><span class="page-arrow" aria-hidden="true">←</span> Previous</button>
     <span class="page-counter" role="status" aria-label={`${groups.length} players, page ${currentPage + 1} of ${pageCount}`}>
      <span><strong>{currentPage + 1}</strong> / {pageCount}</span>
      <small>{groups.length} {groups.length === 1 ? 'player' : 'players'}</small>
     </span>
     <button type="button" class="page-button" disabled={busy || currentPage === pageCount - 1} onclick={() => changePage(currentPage + 1)}>Next <span class="page-arrow" aria-hidden="true">→</span></button>
    </nav>
   {/if}
  {/if}
 </div>
</section>

<style>
 .candidates { min-width: 0; }
 .candidate-content { min-width: 0; scroll-margin-top: 72px; }
 .filter-rail { min-width: 0; }
 .search-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-2); margin-block: var(--space-1) var(--space-2); }
 .search-row label { grid-column: 1 / -1; }
 .filters-toggle { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 3rem; padding-inline: var(--space-4); }
 .filters-badge { padding: .1rem .4rem; border-radius: 999px; background: var(--text); color: var(--background); font-size: var(--text-xs); font-weight: 750; }
 .filter-panel { margin-bottom: var(--space-2); }
 .filter-panel[hidden] { display: none; }
 .search-row label, legend { font-size: var(--text-sm); font-weight: 650; }
 input[type='search'] { width: 100%; min-width: 0; min-height: 3rem; }
 fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
 legend { margin-bottom: var(--space-2); }
 .filter-options { display: flex; flex-wrap: wrap; gap: var(--space-2); }
 .filter { min-width: 2.75rem; min-height: 2.75rem; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); }
 .filter { text-align: left; }
 .filter { display: inline-flex; align-items: baseline; gap: .35rem; }
 .filter-count { color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
 .filter[aria-pressed='true'] { color: var(--background); border-color: var(--text); background: var(--text); }
 .filter[aria-pressed='true'] .filter-count { color: inherit; }
 .section-heading { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-4); align-items: baseline; justify-content: space-between; margin-block: var(--space-6) var(--space-3); }
 /* On phones the first section sits right under search so its cards start above the fold. */
 .candidates:not(.candidates-wide) .player-section:first-of-type .section-heading { margin-top: var(--space-3); }
 .section-heading h3 { font-size: var(--text-lg); }
 .card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 10px; align-items: start; }
 .candidate-card { display: grid; gap: var(--space-2); width: 100%; max-width: 24rem; min-width: 0; margin-inline: auto; }
 /* A player with no open position stays browsable but reads as unavailable. */
 .candidate-card[data-blocked='true']:not([data-selected='true']) { opacity: .5; filter: grayscale(.85); }
 .candidates:has(.candidate-card[data-selected='true']) .candidate-card:not([data-selected='true']) :global(.art-frame) { opacity: .56; }
 /* The previewed card already sits on the field, so its source steps back slightly. */
 .candidate-card[data-previewing='true'] :global(.art-frame) { opacity: .7; transition: opacity .18s ease-out; }
 .empty { padding-block: var(--space-4) var(--space-8); }
 .search-field { position: relative; display: block; min-width: 0; }
 .search-field input { padding-right: 2.75rem; }
 .search-field input::-webkit-search-cancel-button { display: none; }
 .clear-search { position: absolute; top: 50%; right: 2px; translate: 0 -50%; width: 2.75rem; padding: 0; color: var(--muted); font-size: 1.4rem; line-height: 1; }
 .sort-row { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2); font-size: var(--text-sm); }
 .sort-label { color: var(--muted); font-weight: 650; white-space: nowrap; }
 .sort-options { display: flex; flex: 1; gap: 3px; padding: 2px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--background); }
 .sort-options button { flex: 1; min-height: 2.5rem; padding: 0 var(--space-3); border: 0; background: transparent; color: var(--muted); font-size: var(--text-base); }
 .sort-options button[aria-pressed='true'] { background: var(--text); color: var(--background); }
 .ranking-status { font-size: var(--text-sm); }
 .pagination { display: flex; align-items: center; justify-content: space-between; gap: var(--space-1); width: min(100%, 17.25rem); box-sizing: border-box; margin: var(--space-6) auto 0; padding: 1px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
 .page-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); min-height: 44px; padding: 0 var(--space-3); border: 0; background: transparent; font-size: var(--text-sm); font-weight: 650; }
 .page-button:not(:disabled):hover { background: var(--surface-hover); }
 .page-button:disabled { opacity: .4; }
 .page-arrow { font-size: 1.125rem; line-height: 1; }
 .page-counter { display: grid; gap: 2px; min-width: 3.5rem; color: var(--muted); font-size: var(--text-sm); line-height: 1.1; font-variant-numeric: tabular-nums; text-align: center; white-space: nowrap; }
 .page-counter small { font-size: var(--text-xs); }
 .page-counter strong { color: var(--text); }
 @media (min-width: 48rem) {
  .candidates-wide { display: grid; grid-template-columns: 132px minmax(0, 1fr); gap: 28px; align-items: start; }
  .candidates-wide .filter-rail { position: sticky; top: 72px; max-height: calc(100dvh - 88px); overflow-y: auto; overscroll-behavior: contain; padding: 0 .25rem .25rem; }
  .candidates-wide .filter-options { display: grid; gap: 3px; }
  .candidates-wide .filter { display: flex; justify-content: space-between; align-items: center; gap: .45rem; width: 100%; min-height: 44px; padding: 0 10px; border-radius: 4px; }
  /* The first heading lines up with Your field: the panel's border plus its header padding. */
  .candidates-wide .player-section:first-of-type .section-heading { margin-top: calc(1rem + 1px); }
  .candidates-wide .section-heading h3 { font: italic 900 1.5rem/1 'Barlow Condensed', sans-serif; text-transform: uppercase; }
  .candidates-wide .search-row { grid-template-columns: minmax(0, 1fr); margin-block: 0 20px; }
  .candidates-wide .sort-row { display: grid; gap: var(--space-2); margin-bottom: 20px; }
  .candidates-wide .sort-options button { padding-inline: var(--space-1); font-size: var(--text-sm); }
  .candidates-wide .card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 20px; grid-auto-flow: dense; }
 }
 @media (min-width: 23.4375rem) and (max-width: 47.999rem) {
  .card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 10px; }
 }
 @media (min-width: 48rem) and (max-width: 1099px) {
  .candidates:not(.candidates-wide) .card-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
 }
 @media (min-width: 1360px) {
  .candidates-wide .card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
 }
</style>
