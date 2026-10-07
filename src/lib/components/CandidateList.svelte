<script lang="ts">
 import { tick, untrack } from 'svelte';
 import { availableCandidates, legalSlots } from '../game/draft.ts';
 import { draftRules } from '../game/rules.ts';
 import type { Draft, Manifest, Profile, Slot } from '../game/types.ts';
 import { rankingForSeason } from '../rankings/client.ts';
 import type { WarRankings } from '../rankings/types.ts';
 import { isHitter, rankGroups, warValue } from './candidate-ranking.ts';
 import type { CandidateEntry, CandidateGroup, RankingKind, RankingSort } from './candidate-ranking.ts';
 import { candidateGridMotion, createCandidateGridMotion } from '../cards/grid-motion.ts';
 import DraftAssignment from './DraftAssignment.svelte';
 import PlayerCard from './PlayerCard.svelte';
 let { profiles, draft, manifest, rankings, rankingLoading, rankingError, onRetryRankings, busy, onDraft }: {
  profiles: Profile[];
  draft: Draft;
  manifest: Manifest;
  rankings: WarRankings | null;
  rankingLoading: boolean;
  rankingError: boolean;
  onRetryRankings: () => void;
  busy: boolean;
  onDraft: (seasonId: string, slot: Slot) => void;
 } = $props();
 interface CandidateMotionState {
  draftKey: string;
  page: number;
  query: string;
  filter: Slot | 'All';
  sort: RankingSort;
  rankings: WarRankings | null;
 }
 const uid = $props.id();
 const gridMotion = createCandidateGridMotion();
 let candidateMotionState: CandidateMotionState | null = null;
 let query = $state('');
 let filter = $state<Slot | 'All'>('All');
 let page = $state(0);
 let selected = $state<string | null>(null);
 let chosenSlot = $state<Slot | null>(null);
 let selectionTrigger: HTMLButtonElement | null = null;
 let selectedSeasons = $state(new Map<string, string>());
 let browseRevision = $state(0);
 let sort = $state<RankingSort>('war');
 let results = $state<HTMLElement>();
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
 const viableCandidateIds = $derived(new Set(availableCandidates(draft, manifest).map(candidate => candidate.seasonId)));
 const qualificationSlots = $derived(draftRules(draft.schemaVersion).slots.filter(slot => candidates.some(candidate => candidate.eligibleSlots.includes(slot))));
 const activeFilter = $derived(filter === 'All' || qualificationSlots.includes(filter) ? filter : 'All');
 const occupiedSlots = $derived(new Set(draft.picks.map(pick => pick.slot)));
 const selectedCandidate = $derived(selected ? candidateIndex.get(selected) : undefined);
 const selectedProfile = $derived(selectedCandidate ? profiles.find(profile => profile.seasonId === selected) : undefined);
 const assignmentSlots = $derived(selectedCandidate && viableCandidateIds.has(selectedCandidate.seasonId) ? legalSlots(draft, selectedCandidate, manifest) : []);
 const groups = $derived.by(() => {
  const entries: CandidateEntry[] = [];
  const needle = query.trim().toLowerCase();
  for (const profile of profiles) {
   if (!candidateIndex.has(profile.seasonId)) continue;
   if (activeFilter !== 'All' && !profile.eligibleSlots.includes(activeFilter)) continue;
   if (needle && !`${profile.displayName} ${profile.year} ${profile.historicalTeam}`.toLowerCase().includes(needle)) continue;
   entries.push({ profile, slots: activeFilter === 'All' ? profile.eligibleSlots : [activeFilter] });
  }
  return rankGroups(entries, sort, rankings);
 });
 const pageCount = $derived(Math.max(1, Math.ceil(groups.length / 20)));
 const currentPage = $derived(Math.min(page, pageCount - 1));
 const visibleGroups = $derived(groups.slice(currentPage * 20, (currentPage + 1) * 20));
 const sectionKinds: RankingKind[] = ['Hitters', 'Pitchers', 'Bullpens'];
 const sections = $derived(sectionKinds.map(kind => ({ kind, groups: visibleGroups.filter(group => group.kind === kind) })));
 const draftBrowseKey = $derived(`${draft.schemaVersion}:${draft.dataVersion}:${draft.seed}:${draft.picks.map(pick => pick.seasonId).join('|')}:${draft.currentRoll?.franchiseId ?? ''}:${draft.currentRoll?.decade ?? ''}`);

 function selectedEntry(group: CandidateGroup): CandidateEntry {
  const seasonId = selectedSeasons.get(group.playerId);
  return group.entries.find(entry => entry.profile.seasonId === seasonId) ?? group.entries[0];
 }
 function cardRankingKind(profile: Profile): RankingKind {
  if (profile.eligibleSlots.includes('BP')) return 'Bullpens';
  return profile.eligibleSlots.some(isHitter) ? 'Hitters' : 'Pitchers';
 }
 function rememberSeason(playerId: string, seasonId: string) {
  const next = new Map(selectedSeasons);
  next.set(playerId, seasonId);
  selectedSeasons = next;
 }
 function changeSeason(group: CandidateGroup, seasonId: string) {
  if (!group.entries.some(entry => entry.profile.seasonId === seasonId)) return;
  const previous = selectedEntry(group).profile.seasonId;
  rememberSeason(group.playerId, seasonId);
  if (selected === previous) {
   selected = seasonId;
  }
 }
 function resetBrowse() { page = 0; selected = null; chosenSlot = null; }
 function resetDraftBrowse() {
  resetBrowse();
  selectedSeasons = new Map<string, string>();
  browseRevision++;
 }
 async function selectSeason(seasonId: string, playerId: string) {
  rememberSeason(playerId, seasonId);
  if (selected === seasonId) { clearSelection(); return; }
  const active = document.activeElement;
  selectionTrigger = active instanceof HTMLButtonElement && active.matches('[data-choose-season]')
   ? active
   : document.querySelector<HTMLButtonElement>(`[data-choose-season="${CSS.escape(seasonId)}"]`);
  selected = seasonId;
  chosenSlot = null;
  await tick();
  const dock = document.getElementById(`${uid}-assignment`);
  (dock?.querySelector<HTMLInputElement>('input') ?? dock)?.focus({ preventScroll: true });
 }
 function clearSelection() {
  selected = null;
  chosenSlot = null;
  selectionTrigger?.focus({ preventScroll: true });
 }
 function changePage(next: number) {
  page = next;
  selected = null;
  chosenSlot = null;
  document.getElementById(`${uid}-results`)?.focus();
 }
 function commit() {
  if (!busy && selected && chosenSlot && assignmentSlots.includes(chosenSlot)) onDraft(selected, chosenSlot);
 }
 function sectionDescription(kind: RankingKind): string {
  if (kind === 'Bullpens') return 'Lowest pooled ERA first, then workload';
  if (sort === 'metrics') return kind === 'Hitters' ? 'Best eligible OPS first' : 'Lowest eligible ERA first';
  if (rankings) return `Best eligible ${kind === 'Hitters' ? 'batting' : 'pitching'} WAR/162 first`;
  return 'WAR order unavailable · stable ID order';
 }
 $effect(() => { draftBrowseKey; untrack(resetDraftBrowse); });
 $effect(() => { if (chosenSlot && !assignmentSlots.includes(chosenSlot)) chosenSlot = null; });
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
  if (next.draftKey !== previous.draftKey || !reordered) {
   if (next.draftKey !== previous.draftKey || next.page !== previous.page) gridMotion.skip();
   return;
  }
  const revision = gridMotion.capture();
  void tick().then(() => gridMotion.play(revision));
 });
</script>

<section use:candidateGridMotion={gridMotion} class="candidates" aria-label="Choose a historical player season" aria-busy={busy}>
 <div class="search-row">
  <label for="{uid}-search">Find your pick</label>
  <input id="{uid}-search" type="search" placeholder="Player, year, or historical team" bind:value={query} oninput={resetBrowse} disabled={busy} />
 </div>
 <fieldset class="filters" disabled={busy}>
  <legend>Qualifies for position</legend>
  <div class="filter-options">
   {#each ['All', ...qualificationSlots] as slot}
    <button type="button" class="quiet filter" aria-pressed={activeFilter === slot} onclick={() => { filter = slot as Slot | 'All'; resetBrowse(); }}>{slot}</button>
   {/each}
  </div>
 </fieldset>
 <div class="ranking-controls">
  <label for="{uid}-sort">Rank players &amp; seasons</label>
  <select id="{uid}-sort" bind:value={sort} disabled={busy} onchange={resetBrowse}>
   <option value="war">Composite WAR / 162</option>
   <option value="metrics">Historical OPS / ERA</option>
  </select>
  <a href="/about#rankings">Ranking source &amp; method</a>
 </div>
 {#if rankingLoading}
  <p class="ranking-status muted" role="status">Loading composite WAR/162.{sort === 'war' ? ' Cards are in stable ID order until it arrives. Choose Historical OPS / ERA to sort by those stats now.' : ''} Drafting is available.</p>
 {:else if rankingError}
  <div class="ranking-status">
   <p role="status">Composite WAR/162 is unavailable.{sort === 'war' ? ' Cards are in stable ID order, not ranked by WAR. Switch to Historical OPS / ERA or retry.' : ''} You can still draft.</p>
   <button type="button" class="secondary" onclick={onRetryRankings}>Retry rankings</button>
  </div>
 {/if}
 <div class="list-meta" id="{uid}-results" bind:this={results} tabindex="-1">
  <p role="status">{groups.length} {groups.length === 1 ? 'card' : 'cards'}{groups.length > 20 ? ` · Page ${currentPage + 1} of ${pageCount}` : ''}</p>
  <p class="muted">Historical stats. Select an exact season on its card.</p>
 </div>
 {#if !draft.currentRoll}
  <p class="notice">Roll a franchise and era to open your next player pool.</p>
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
      <span class="muted">{sectionDescription(section.kind)}</span>
     </div>
     <div class="card-grid">
      {#each section.groups as group (`${browseRevision}:${group.key}`)}
       {@const entry = selectedEntry(group)}
       {@const profile = entry.profile}
       {@const candidate = candidateIndex.get(profile.seasonId)!}
       {@const directSlots = viableCandidateIds.has(profile.seasonId) ? legalSlots(draft, candidate, manifest) : []}
       {@const cardKind = cardRankingKind(profile)}
       {@const occupiedQualifications = profile.eligibleSlots.filter(slot => occupiedSlots.has(slot))}
       <div class="candidate-card" data-candidate-group={group.playerId}>
        <PlayerCard
         {profile}
         seasons={group.entries.map(item => item.profile)}
         onSeasonChange={seasonId => changeSeason(group, seasonId)}
         legalSlots={directSlots}
         war={warValue({ profile, slots: profile.eligibleSlots }, cardKind, rankings)}
         ranking={rankingForSeason(rankings, profile.seasonId)}
         {rankings}
         {manifest}
         {rankingLoading}
         {rankingError}
         inspectionReturnFocus={results}
         selected={selected === profile.seasonId}
         onChoose={() => selectSeason(profile.seasonId, group.playerId)}
        />
        {#if occupiedQualifications.length}
         <p class="occupied-context">Occupied qualifications:
          {#each occupiedQualifications as slot, index}<span>{slot} (occupied)</span>{index < occupiedQualifications.length - 1 ? ' · ' : ''}{/each}
         </p>
        {/if}
       </div>
      {/each}
     </div>
    </section>
   {/if}
  {/each}
  {#if pageCount > 1}
   <nav class="pagination" aria-label="Player card pages">
    <button type="button" class="secondary" disabled={busy || currentPage === 0} onclick={() => changePage(currentPage - 1)}>Previous</button>
    <span>{currentPage + 1} / {pageCount}</span>
    <button type="button" class="secondary" disabled={busy || currentPage === pageCount - 1} onclick={() => changePage(currentPage + 1)}>Next</button>
   </nav>
  {/if}
 {/if}
 {#if selectedProfile}
  <DraftAssignment id="{uid}-assignment" profile={selectedProfile} slots={assignmentSlots} bind:chosenSlot {busy} onDraft={commit} onClose={clearSelection} />
 {/if}
</section>

<style>
 .candidates { min-width: 0; }
 .search-row { display: grid; gap: var(--space-2); margin-block: var(--space-6) var(--space-4); }
 .search-row label, legend { font-size: var(--text-sm); font-weight: 650; }
 input[type='search'] { width: 100%; min-width: 0; min-height: 3rem; }
 fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
 legend { margin-bottom: var(--space-2); }
 .filter-options { display: flex; flex-wrap: wrap; gap: var(--space-2); }
 .filter { min-width: 2.75rem; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); }
 .filter[aria-pressed='true'] { color: var(--background); border-color: var(--text); background: var(--text); }
 .list-meta { margin-block: var(--space-4); font-size: var(--text-xs); }
 .list-meta p { margin: var(--space-1) 0; }
 .section-heading { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); align-items: baseline; justify-content: space-between; margin-block: var(--space-6) var(--space-3); }
 .section-heading h3 { font-size: var(--text-lg); }
 .section-heading span { font-size: var(--text-xs); }
 .card-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-5); align-items: start; }
 .candidate-card { display: grid; gap: var(--space-2); width: 100%; max-width: 24rem; min-width: 0; margin-inline: auto; }
 .occupied-context { margin: 0; padding-inline: var(--space-2); color: var(--muted); font-size: var(--text-xs); }
 .occupied-context span { color: var(--text); }
 .pagination { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-top: var(--space-6); }
 .empty { padding-block: var(--space-4) var(--space-8); }
 .ranking-controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); margin-top: var(--space-4); font-size: var(--text-sm); }
 .ranking-controls label { font-weight: 650; }
 .ranking-controls a { display: inline-flex; align-items: center; min-height: 2.75rem; font-size: var(--text-xs); }
 .ranking-status { font-size: var(--text-sm); }
 @media (min-width: 36rem) {
  .card-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 24rem)); justify-content: center; }
 }
</style>
