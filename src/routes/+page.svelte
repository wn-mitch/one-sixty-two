<script lang="ts">
 import { onMount, tick } from 'svelte';
 import { Session } from '#lib/game/session.svelte.ts';
 import Reveal from '#lib/components/Reveal.svelte';
 import CandidateList from '#lib/components/CandidateList.svelte';
 import Roster from '#lib/components/Roster.svelte';
 import Lineup from '#lib/components/Lineup.svelte';
 import Progress from '#lib/components/Progress.svelte';
 import Results from '#lib/components/Results.svelte';
 import TeamLogo from '#lib/components/TeamLogo.svelte';
 const session = new Session();
 onMount(() => { void session.initialize(); return () => session.dispose(); });
 $effect(() => {
  const phase = session.phase;
  const choosing = phase === 'choosing' && !session.loading;
  const target = phase === 'ready' ? '#roll-next' : choosing ? '.candidates input[type="search"]' : phase === 'lineup' ? '#lineup-heading' : phase === 'simulating' ? '#simulation-heading' : phase === 'results' ? '#results-heading' : null;
  if (target) void tick().then(() => {
   if (session.phase !== phase || (phase === 'choosing' && session.loading)) return;
   document.querySelector<HTMLElement>(target)?.focus({ preventScroll: phase === 'results' });
   if (phase === 'results') window.scrollTo(0, 0);
  });
 });
</script>

<svelte:head>
 <title>162-0 | The undefeated baseball challenge</title>
 <meta name="description" content="Roll a franchise and decade. Draft thirteen historical player-seasons. Can your team survive 162 games without a loss?" />
</svelte:head>

<main>
 <div class="sr-only" aria-live="polite" aria-atomic="true">{session.announce}</div>
 {#if session.storageNotice}<p class="notice">{session.storageNotice}</p>{/if}
 {#if session.error}
  <div class="error" role="alert">
   <p>{session.error}</p>
   {#if session.canRetry}<button class="secondary" disabled={session.loading} onclick={() => void session.retry()}>Retry</button>{/if}
   {#if session.incompatible}<button class="secondary" disabled={session.loading} onclick={() => session.requestNew()}>Start new draft</button>{/if}
  </div>
 {/if}
 {#if session.confirmNew}
  <section class="confirmation" aria-label="Confirm new draft">
   <h2>Leave this roster behind?</h2>
   <p>Your picks are permanent. Starting a new draft replaces this saved run with a new seed.</p>
   <div class="actions"><button class="secondary" onclick={() => session.confirmNew = false}>Keep draft</button><button class="primary" onclick={() => void session.startNew()}>Discard and start new</button></div>
  </section>
 {/if}

 {#if session.phase === 'start'}
  <section class="welcome">
   <div class="welcome-copy">
    <p class="eyebrow">Baseball history. One undefeated season.</p>
    <h1>Can you go <strong>162-0?</strong></h1>
    <p class="intro">Roll a franchise and decade. Draft nine hitters, three starters, and a closer — one franchise and one athlete each. Take your team through all 162 games.</p>
    <div class="actions">
     <button class="primary start" disabled={session.loading || !session.manifest} onclick={() => session.requestNew()}>Start draft <span aria-hidden="true">↗</span></button>
     {#if session.savedDraft}<button class="secondary" disabled={session.loading} onclick={() => void session.resume()}>Resume draft</button>{/if}
    </div>
    {#if session.loading}<p class="muted" role="status">Loading the historical player pool…</p>{/if}
    <p class="start-note">Great teams still lose. That's the challenge.</p>
   </div>
   <aside class="welcome-lineup" aria-label="Your challenge roster">
    <div class="preview-heading"><span class="eyebrow">The roster card</span><span>13 picks</span></div>
    <h2>Build from the greats.<br />Win with your choices.</h2>
    <div class="preview-line"><strong>09</strong><div><span>Hitters</span><small>C · 1B · 2B · 3B · SS · LF · CF · RF · DH</small></div></div>
    <div class="preview-line"><strong>03</strong><div><span>Starting pitchers</span><small>Your rotation. 54 starts apiece.</small></div></div>
    <div class="preview-line"><strong>01</strong><div><span>Closer</span><small>League-average support behind them.</small></div></div>
    <div class="franchise-preview">
     {#if session.manifest}
      <div class="team-marks">{#each session.manifest.franchises.slice(0, 4) as franchise}<TeamLogo franchiseId={franchise.id} label={franchise.name} size="small" />{/each}</div>
     {/if}
     <p>30 franchises · 1961–2025 player-seasons<br />Actual 2025 opposition</p>
    </div>
   </aside>
  </section>
 {:else if session.draft && session.manifest}
  {#if session.phase === 'ready' || session.phase === 'revealing' || session.phase === 'choosing'}
   <div class="draft-top"><p class="eyebrow">Historical draft <span class="stage-divider">/</span> {session.draft.picks.length} of 13 locked</p><button class="quiet" disabled={session.loading} onclick={() => session.requestNew()}>New draft</button></div>
   <div class="draft-layout">
    <aside><Roster draft={session.draft} profiles={session.profiles} /></aside>
    <section class="draft-main" aria-label="Make your next pick">
     <Reveal roll={session.draft.currentRoll} manifest={session.manifest} revealing={session.phase === 'revealing'} pickNumber={session.draft.picks.length + 1} />
     {#if session.phase === 'ready'}
      <div class="next-roll"><p class="muted">{session.draft.picks.length ? "Pick locked in. Who's next?" : 'Your roster starts with one roll.'}</p><button id="roll-next" class="primary" disabled={session.busy} onclick={() => void session.roll()}>Roll next franchise <span aria-hidden="true">↗</span></button></div>
     {:else if session.loading || session.phase === 'revealing'}
      <div class="stack" role="status" aria-label="Loading available player seasons"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><span class="muted">Finding eligible seasons…</span></div>
     {:else if session.pool.length > 0}
      <CandidateList profiles={session.pool} draft={session.draft} manifest={session.manifest} busy={session.busy} onDraft={(id, slot) => session.commit(id, slot)} />
     {/if}
    </section>
   </div>
  {:else if session.phase === 'lineup'}
   <div class="draft-top"><p class="eyebrow">Roster complete</p><button class="quiet" disabled={session.loading} onclick={() => session.requestNew()}>New draft</button></div>
   <Lineup draft={session.draft} profiles={session.profiles} busy={session.busy} onOrder={(kind, order) => session.order(kind, order)} onsimulate={() => void session.simulate()} />
  {:else if session.phase === 'simulating'}
   <div class="draft-top"><p class="eyebrow">Season in play</p><button class="quiet" disabled={session.loading} onclick={() => session.requestNew()}>New draft</button></div>
   <Progress completed={session.completed} revealed={session.revealed} result={session.result} onskip={() => session.skip()} />
  {:else if session.phase === 'results' && session.result}
   <Results result={session.result} draft={session.draft} profiles={session.profiles} onNew={() => session.requestNew()} onShare={() => void session.share()} shareLink={session.shareLink} shareStatus={session.shareStatus} />
  {/if}
 {/if}
</main>

<style>
 main { min-height: 65vh; padding-block: var(--space-6); }
 .welcome { display: grid; gap: var(--space-12); padding-block: var(--space-8) var(--space-4); }
 .welcome-copy { min-width: 0; }
 .welcome .eyebrow { margin: 0 0 var(--space-4); }
 h1 { font-size: var(--text-2xl); }
 h1 strong { display: block; white-space: nowrap; font-size: 5rem; line-height: 1.05; letter-spacing: -.065em; margin-top: var(--space-2); }
 .intro { font-size: var(--text-base); color: var(--muted); margin: var(--space-6) 0; max-width: 44ch; }
 .actions { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }
 .start { display: flex; justify-content: space-between; align-items: center; width: 100%; max-width: 20rem; font-size: var(--text-base); min-height: 3.5rem; padding-inline: var(--space-5); }
 .start-note { margin-top: var(--space-4); color: var(--muted); font-size: var(--text-xs); }
 .welcome-lineup { background: var(--surface); padding: var(--space-6); border-block: 1px solid var(--border); }
 .preview-heading { display: flex; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-6); }
 .preview-heading .eyebrow { margin: 0; }
 .preview-heading > span:last-child { color: var(--muted); font-size: var(--text-xs); }
 .welcome-lineup h2 { font-size: var(--text-xl); margin-bottom: var(--space-6); }
 .preview-line { display: flex; align-items: center; gap: var(--space-4); padding-block: var(--space-4); border-top: 1px solid var(--border); }
 .preview-line > strong { color: var(--muted); font-size: var(--text-xl); font-weight: 500; }
 .preview-line > div { display: grid; gap: var(--space-1); }
 .preview-line small { color: var(--muted); font-size: var(--text-xs); }
 .franchise-preview { margin-top: var(--space-6); }
 .team-marks { display: flex; flex-wrap: wrap; align-items: start; gap: var(--space-4); }
 .franchise-preview p { color: var(--muted); font-size: var(--text-xs); margin: var(--space-4) 0 0; }
 .draft-top { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); margin-bottom: var(--space-4); }
 .stage-divider { padding-inline: var(--space-2); color: var(--border); }
 .draft-layout { display: grid; gap: var(--space-6); min-width: 0; }
 aside, .draft-main { min-width: 0; }
 .next-roll { margin-block: var(--space-8); }
 .next-roll p { margin-bottom: var(--space-4); }
 .confirmation { border: 1px solid var(--accent); background: var(--surface); padding: var(--space-5); border-radius: var(--radius); margin-bottom: var(--space-6); }
 .confirmation h2 { font-size: var(--text-xl); }
 .error p { margin: 0 0 var(--space-3); }
 .error button + button { margin-left: var(--space-2); }
 .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
 @media (min-width: 64rem) {
  main { padding-block: var(--space-8); }
  .welcome { grid-template-columns: 1.25fr 1fr; align-items: center; gap: var(--space-16); padding-block: var(--space-12); }
  h1 { font-size: var(--text-3xl); }
  h1 strong { font-size: 7rem; }
  .intro { font-size: var(--text-lg); }
  .draft-layout { grid-template-columns: minmax(0, 1fr) 20rem; align-items: start; gap: var(--space-8); }
  .draft-layout > aside { grid-column: 2; grid-row: 1; position: sticky; top: var(--space-6); }
  .draft-main { grid-column: 1; grid-row: 1; }
 }
 @media (max-width: 24rem) { h1 strong { font-size: var(--text-score); } .welcome-lineup { padding: var(--space-4); } .draft-top .eyebrow { max-width: 10rem; } }
</style>
