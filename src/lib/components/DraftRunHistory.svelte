<script lang="ts">
 import { SvelteMap } from 'svelte/reactivity';
 import ClubCard, { type ClubCardStar } from './library/ClubCard.svelte';
 import { createCardViewModel } from '../cards/view-model.ts';
 import { completedRuns, type SavedRun } from '../draft/saves.ts';
 import { LEAGUE_VERSION, standings } from '../draft/league.ts';
 import { unsupportedVersion } from '../draft/run.ts';
 import { ProfileStore } from '../draft/load.ts';
 import { loadMedia } from '../media/client.ts';
 import { deviceDb } from '../storage/db.ts';
 import type { Manifest } from '../game/types.ts';
 import { finishGrade } from '../draft/report.ts';

 let { manifest }: { manifest: Manifest } = $props();
 let runs = $state.raw<SavedRun[]>([]);
 let loading = $state(true);
 let error = $state('');
 let artworkNotice = $state('');
 let attempt = $state(0);
 const stars = new SvelteMap<string, ClubCardStar[]>();
 const entries = $derived(runs.map(saved => {
  const season = saved.season!;
  // The stored first rivalry pins the human seat, even when newer seating rules differ.
  const human = season.rivals[0]?.[0] ?? -1;
  const table = standings(season);
  const record = table.find(row => row.seat === human);
  const lineup = season.lineups[human];
  const retired = !!unsupportedVersion(saved.setup, manifest.dataVersion) || season.version !== LEAGUE_VERSION;
  return {
   saved, record, retired, grade: record ? finishGrade(table, human) : null,
   title: manifest.franchises.find(club => club.id === saved.setup.franchiseId)?.name ?? saved.setup.franchiseId,
   roster: Object.entries(lineup?.active ?? {}).map(([label, seasonId]) => ({ seasonId, label }))
  };
 }));

 $effect(() => {
  const current = manifest;
  attempt;
  let disposed = false;
  loading = true;
  error = '';
  artworkNotice = '';
  stars.clear();
  void (async () => {
   const { db, notice } = await deviceDb();
   const saved = await completedRuns(db);
   if (disposed) return;
   runs = saved;
   loading = false;
   if (notice) artworkNotice = notice;
   if (!saved.length) return;
   const media = await loadMedia().catch(() => null);
   if (disposed) return;
   if (!media) artworkNotice = 'Player photos are unavailable. Your saved records and results are still accessible.';
   const profiles = new ProfileStore(current);
   for (const entry of saved) {
    if (disposed) return;
    if (unsupportedVersion(entry.setup, current.dataVersion) || entry.season!.version !== LEAGUE_VERSION) continue;
    const human = entry.season!.rivals[0]?.[0] ?? -1;
    const ids = Object.values(entry.season!.lineups[human]?.active ?? {}).slice(0, 6);
    try {
     const cards = await profiles.load(ids);
     if (!disposed) stars.set(entry.id, ids.flatMap(seasonId => {
      const profile = cards.get(seasonId);
      return profile ? [{ seasonId, view: createCardViewModel({ profile, manifest: current, media, mediaStatus: media ? 'ready' : 'unavailable' }) }] : [];
     }));
    } catch {
     if (!disposed) artworkNotice = 'Some player artwork could not load. Your saved records and results are still accessible.';
    }
   }
  })().catch(() => {
   if (!disposed) { error = 'Draft Mode history could not load from this browser.'; loading = false; }
  });
  return () => { disposed = true; };
 });
</script>

<section class="draft-history" aria-labelledby="draft-history-heading">
 <h2 id="draft-history-heading">Draft Mode seasons</h2>
 {#if loading}
  <p class="muted" role="status">Loading Draft Mode seasons…</p>
 {:else if error}
  <p class="error" role="alert">{error}</p>
  <button onclick={() => attempt++}>Retry Draft Mode history</button>
 {:else if !entries.length}
  <p class="muted">Completed Draft Mode seasons will appear here.</p>
 {:else}
  {#if artworkNotice}<p class="muted" role="status">{artworkNotice}</p>{/if}
  <ul class="clubs">
   {#each entries as entry (entry.saved.id)}
    <li>
     {#snippet club()}
      <ClubCard title={entry.title} parkName="Draft Mode" recordLabel={entry.record ? `${entry.record.wins} W · ${entry.record.losses} L` : 'Record unavailable'}
       grade={entry.grade}
       stats={entry.record ? [{ label: 'Runs for', value: String(entry.record.runsFor) }, { label: 'Runs against', value: String(entry.record.runsAgainst) }] : []}
       footer={entry.retired ? 'Results unavailable in this version' : 'Full season results'} roster={entry.roster} stars={stars.get(entry.saved.id) ?? []} retired={entry.retired} />
     {/snippet}
     {#if entry.retired}
      {@render club()}
      <p class="retired">Retired season · cannot replay with current rules.</p>
     {:else}
      <a class="club-link" href={`/draft?run=${encodeURIComponent(entry.saved.id)}`} aria-label={`Full season results for ${entry.title}${entry.record ? `, ${entry.record.wins} wins and ${entry.record.losses} losses` : ''}`}>
       {@render club()}
      </a>
     {/if}
    </li>
   {/each}
  </ul>
 {/if}
</section>

<style>
 .draft-history { display: grid; gap: var(--space-4); margin-top: var(--space-8); }
 h2, p { margin: 0; }
 h2 { font-size: var(--text-lg); }
 .clubs { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr)); gap: var(--space-5); margin: 0; padding: 0; list-style: none; }
 li { min-width: 0; max-width: 22rem; }
 .club-link { display: block; color: inherit; text-decoration: none; border-radius: var(--radius-lg); }
 .club-link:hover { outline: 1px solid var(--border); outline-offset: 4px; }
 .retired { margin-top: var(--space-2); color: var(--muted); font-size: var(--text-sm); }
</style>
