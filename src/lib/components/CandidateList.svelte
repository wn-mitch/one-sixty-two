<script lang="ts">
 import { tick } from 'svelte';
 import { availableCandidates, legalSlots, openSlots } from '../game/draft.ts';
 import { average, historicalBatting, historicalEra, innings } from '../game/format.ts';
 import type { Draft, Manifest, Profile, Slot } from '../game/types.ts';
 import { loadRankings } from '../rankings/client.ts';
 import type { WarRankings } from '../rankings/types.ts';
 import { isHitter, rankGroups, warValue, type RankingSort, type CandidateEntry } from './candidate-ranking.ts';
 import PlayerPhoto from './PlayerPhoto.svelte';
 import DraftAssignment from './DraftAssignment.svelte';
 import SeasonNotes from './SeasonNotes.svelte';
 let { profiles, draft, manifest, busy, onDraft }: {
  profiles: Profile[]; draft: Draft; manifest: Manifest; busy: boolean;
  onDraft: (seasonId: string, slot: Slot) => void;
 } = $props();
 const uid = $props.id();
 let query = $state('');
 let filter = $state<Slot | 'All'>('All');
 let page = $state(0);
 let selected = $state<string | null>(null);
 let chosenSlot = $state<Slot | null>(null);
 let selectionTrigger: HTMLButtonElement | null = null;
 let expandedPlayers = $state(new Set<string>());
 let sort = $state<RankingSort>('war');
 let rankings = $state.raw<WarRankings | null>(null);
 let rankingLoading = $state(true);
 let rankingError = $state(false);
 let rankingAttempt = $state(0);
 const slots = $derived(openSlots(draft));
 const candidates = $derived(availableCandidates(draft, manifest));
 const candidateIndex = $derived(new Map(candidates.map(candidate => [candidate.seasonId, candidate])));
 const activeFilter = $derived(filter === 'All' || slots.includes(filter) ? filter : 'All');
 const selectedCandidate = $derived(selected ? candidateIndex.get(selected) : undefined);
 const selectedProfile = $derived(selectedCandidate ? profiles.find(profile => profile.seasonId === selected) : undefined);
 const assignmentSlots = $derived(selectedCandidate ? legalSlots(draft, selectedCandidate, manifest) : []);
 const groups = $derived.by(() => {
  const entries: CandidateEntry[] = [];
  const needle = query.trim().toLowerCase();
  for (const profile of profiles) {
   const candidate = candidateIndex.get(profile.seasonId);
   if (!candidate) continue;
   const eligible = legalSlots(draft, candidate, manifest);
   if (activeFilter !== 'All' && !eligible.includes(activeFilter)) continue;
   if (needle && !`${profile.displayName} ${profile.year} ${profile.historicalTeam}`.toLowerCase().includes(needle)) continue;
   entries.push({ profile, slots: activeFilter === 'All' ? eligible : [activeFilter] });
  }
  return rankGroups(entries, sort, rankings);
 });
 const pageCount = $derived(Math.max(1, Math.ceil(groups.length / 20)));
 const currentPage = $derived(Math.min(page, pageCount - 1));
 const visibleGroups = $derived(groups.slice(currentPage * 20, (currentPage + 1) * 20));
 const sections = $derived((['Hitters', 'Pitchers'] as const).map(kind => ({ kind, groups: visibleGroups.filter(group => group.kind === kind) })));

 function resetBrowse() { page = 0; selected = null; chosenSlot = null; }
 async function selectSeason(seasonId: string, trigger: HTMLButtonElement) {
  if (selected === seasonId) { clearSelection(); return; }
  selectionTrigger = trigger;
  selected = seasonId; chosenSlot = null;
  await tick();
  document.getElementById(`${uid}-assignment`)?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
 }
 function clearSelection() {
  selected = null; chosenSlot = null;
  selectionTrigger?.focus({ preventScroll: true });
 }
 function changePage(next: number) {
  page = next; selected = null; chosenSlot = null;
  document.getElementById(`${uid}-results`)?.focus();
 }
 function commit() {
  if (!busy && selected && chosenSlot && assignmentSlots.includes(chosenSlot)) onDraft(selected, chosenSlot);
 }
 $effect(() => { draft.currentRoll; draft.picks.length; resetBrowse(); });
 $effect(() => {
  const version = manifest.dataVersion;
  rankingAttempt;
  let disposed = false;
  rankings = null; rankingLoading = true; rankingError = false;
  void loadRankings(version).then(value => { if (!disposed) rankings = value; })
   .catch(() => { if (!disposed) rankingError = true; })
   .finally(() => { if (!disposed) rankingLoading = false; });
  return () => { disposed = true; };
 });
</script>

<section class="candidates" aria-label="Choose a historical player season" aria-busy={busy}>
 <div class="search-row">
  <label for="{uid}-search">Find your pick</label>
  <input id="{uid}-search" type="search" placeholder="Player, year, or historical team" bind:value={query} oninput={resetBrowse} disabled={busy} />
 </div>
 <fieldset class="filters" disabled={busy}>
  <legend>Eligible open slot</legend>
  <div class="filter-options">
   {#each ['All', ...slots] as slot}
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
  <p class="ranking-status muted" role="status">Loading composite WAR/162.{sort === 'war' ? ' Seasons are in stable ID order until it arrives. Choose Historical OPS / ERA to sort by those stats now.' : ''} Drafting is available.</p>
 {:else if rankingError}
  <div class="ranking-status">
   <p role="status">Composite WAR/162 is unavailable.{sort === 'war' ? ' Seasons are in stable ID order, not ranked by WAR. Switch to Historical OPS / ERA or retry.' : ''} You can still draft.</p>
   <button type="button" class="secondary" onclick={() => rankingAttempt++}>Retry rankings</button>
  </div>
 {/if}
 <div class="list-meta" id="{uid}-results" tabindex="-1">
  <p role="status">{groups.length} player {groups.length === 1 ? 'group' : 'groups'}{groups.length > 20 ? ` · Page ${currentPage + 1} of ${pageCount}` : ''}</p>
  <p class="muted">Historical stats. Expand a player to compare exact seasons.</p>
 </div>
 {#if !draft.currentRoll}
  <p class="notice">Roll a franchise and era to open your next player pool.</p>
 {:else if groups.length === 0}
  {#if query.trim() || activeFilter !== 'All'}
   <div class="empty">
    <h3>No matches for this search.</h3>
    <p class="muted">Try another name or browse all eligible open slots.</p>
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
      <span class="muted">{sort === 'metrics' ? section.kind === 'Hitters' ? 'Best eligible OPS first' : 'Lowest eligible ERA first' : rankings ? `Best eligible ${section.kind === 'Hitters' ? 'batting' : 'pitching'} WAR/162 first` : 'WAR order unavailable · stable ID order'}</span>
     </div>
     {#each section.groups as group (group.key)}
      <details class="player" ontoggle={(event) => {
       const next = new Set(expandedPlayers);
       if (event.currentTarget.open) next.add(group.key); else next.delete(group.key);
       expandedPlayers = next;
      }}>
       <summary>
        <PlayerPhoto playerId={group.playerId} year={group.entries[0].profile.year} name={group.name} size="small" credits={false} />
        <span class="summary-identity"><span class="player-name">{group.name}</span><span class="summary-meta">{group.entries.length} {group.entries.length === 1 ? 'season' : 'seasons'} · {group.entries[0].slots.join(' / ')}</span></span>
        <span class="expand-label" aria-hidden="true">+</span>
       </summary>
       {#if expandedPlayers.has(group.key)}
       <div class="seasons">
        {#each group.entries as entry (entry.profile.seasonId)}
         {@const profile = entry.profile}
         {@const war = warValue(entry, section.kind, rankings)}
         <article class="season" class:selected-season={selected === profile.seasonId}>
          <div class="season-heading">
           <div class="season-identity"><p class="eyebrow">Draft season</p><h4>{profile.year} <span>{profile.historicalTeam}</span></h4><p class="eligible">Eligible open slots: {entry.slots.join(' · ')}</p></div>
           <button type="button" class="secondary season-toggle" disabled={busy} aria-pressed={selected === profile.seasonId} onclick={event => selectSeason(profile.seasonId, event.currentTarget)}>{selected === profile.seasonId ? 'Clear selection' : `Choose ${profile.year}`}</button>
          </div>
          <p class="war-value">{section.kind === 'Hitters' ? 'Batting' : 'Pitching'} composite WAR/162: <strong>{war === null ? rankingLoading ? 'Loading' : 'Unavailable' : war.toFixed(2)}</strong></p>
          {#if profile.batting && entry.slots.some(isHitter)}
           {@const stats = historicalBatting(profile.batting)}
           <dl class="stats" aria-label="Historical batting statistics">
            <div><dt>AVG</dt><dd>{average(stats.avg)}</dd></div><div><dt>OBP</dt><dd>{average(stats.obp)}</dd></div><div><dt>SLG</dt><dd>{average(stats.slg)}</dd></div><div><dt>HR</dt><dd>{profile.batting.HR}</dd></div><div><dt>PA</dt><dd>{profile.batting.PA}</dd></div>
           </dl>
          {/if}
          {#if profile.pitching && entry.slots.some(slot => !isHitter(slot))}
           <dl class="stats" aria-label="Historical pitching statistics">
            <div><dt>IP</dt><dd>{innings(profile.pitching.IPouts)}</dd></div><div><dt>ERA</dt><dd>{historicalEra(profile.pitching).toFixed(2)}</dd></div><div><dt>SO</dt><dd>{profile.pitching.SO}</dd></div><div><dt>BB</dt><dd>{profile.pitching.BB}</dd></div><div><dt>SV</dt><dd>{profile.pitching.SV}</dd></div>
           </dl>
          {/if}
          <SeasonNotes {profile} getSlots={() => selected === profile.seasonId ? assignmentSlots : legalSlots(draft, candidateIndex.get(profile.seasonId)!, manifest)} selectedSlot={selected === profile.seasonId ? chosenSlot : null} />
         </article>
        {/each}
       </div>
       {/if}
      </details>
     {/each}
    </section>
   {/if}
  {/each}
  {#if pageCount > 1}
   <nav class="pagination" aria-label="Player groups pages">
    <button type="button" class="secondary" disabled={busy || currentPage === 0} onclick={() => changePage(currentPage - 1)}>Previous</button>
    <span>{currentPage + 1} / {pageCount}</span>
    <button type="button" class="secondary" disabled={busy || currentPage === pageCount - 1} onclick={() => changePage(currentPage + 1)}>Next</button>
   </nav>
  {/if}
 {/if}
 {#if selectedProfile && assignmentSlots.length}
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
 .section-heading { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); align-items: baseline; justify-content: space-between; margin-block: var(--space-6) var(--space-2); }
 .section-heading h3 { font-size: var(--text-lg); }
 .section-heading span { font-size: var(--text-xs); }
 .player { border-bottom: 1px solid var(--border); }
 .player > summary { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-2); list-style: none; }
 .player > summary::-webkit-details-marker { display: none; }
 .player > summary:hover { background: var(--surface); }
 .summary-identity { display: grid; gap: var(--space-1); flex: 1; min-width: 0; }
 .player-name { font-weight: 700; overflow-wrap: anywhere; }
 .summary-meta { color: var(--muted); font-size: var(--text-xs); }
 .expand-label { color: var(--muted); font-size: var(--text-xl); }
 .player[open] > summary .expand-label { transform: rotate(45deg); }
 .player[open] > summary { background: var(--surface); }
 .seasons { padding-inline: var(--space-2); }
 .season { padding-block: var(--space-4); border-top: 1px solid var(--border); }
 .season-heading { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-3); }
 .season-identity { flex: 1; min-width: 8rem; }
 .season-identity .eyebrow { margin: 0 0 var(--space-1); }
 h4 { margin: 0; font-size: var(--text-lg); font-weight: 750; }
 h4 span { display: block; font-size: var(--text-sm); font-weight: 500; color: var(--muted); }
 .eligible { margin: var(--space-2) 0 0; font-size: var(--text-xs); color: var(--muted); }
 .season-toggle { flex-shrink: 0; }
 .stats { display: flex; flex-wrap: wrap; gap: var(--space-4) var(--space-6); margin: var(--space-4) 0 0; }
 .stats dt { font-size: var(--text-xs); color: var(--muted); }
 .stats dd { margin: var(--space-1) 0 0; font-size: var(--text-base); font-weight: 650; }
 .pagination { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-top: var(--space-6); }
 .empty { padding-block: var(--space-4) var(--space-8); }
 .ranking-controls { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); margin-top: var(--space-4); font-size: var(--text-sm); }
 .ranking-controls label { font-weight: 650; }
 .ranking-controls a { display: inline-flex; align-items: center; min-height: 2.75rem; font-size: var(--text-xs); }
 .ranking-status { font-size: var(--text-sm); }
 .war-value { margin: var(--space-3) 0 0; font-size: var(--text-xs); color: var(--muted); }
 .war-value strong { color: var(--text); }
 .selected-season .season-toggle { border-color: var(--accent); color: var(--accent); }
 @media (max-width: 30rem) { .stats { gap: var(--space-4); } }
</style>
