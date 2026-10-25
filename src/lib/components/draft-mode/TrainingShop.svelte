<script lang="ts">
 import type { Profile } from '../../game/types.ts';
 import type { LeagueSeason } from '../../draft/league.ts';
 import type { DraftRun } from '../../draft/run.ts';
 import { offersAt, refusal, seasonRoster, trainedThisVisit } from '../../draft/shop.ts';
 import { canTrain, developed, statLine, train, TRAININGS, woba, type TrainingKind } from '../../draft/training.ts';

 /**
  * The stop's training shop: pick a training, see which of the club's cards it fits and what it
  * would do to each, and buy one per card from the bank. Fielding shows a 0-100 glove scale: 50 is
  * a median fielder at the position, 100 elite.
  */
 let { run, season, revision, profiles, working, onTrain }: {
  run: DraftRun; season: LeagueSeason; revision: number; profiles: ReadonlyMap<string, Profile>; working: boolean;
  onTrain: (cardId: string, kind: TrainingKind) => Promise<string | null>;
 } = $props();
 const human = $derived(run.seating.humanSeat);
 const stop = $derived.by(() => { void revision; return season.segments.length; });
 const offers = $derived(offersAt(run.setup.seed, stop));
 const cash = $derived.by(() => { void revision; return season.cash[human]; });
 let chosen = $state<TrainingKind>('hitting');
 let notice = $state('');
 // The season mutates in place, so the list re-reads it when `revision` moves.
 const rows = $derived.by(() => {
  void revision;
  const kind = chosen;
  return seasonRoster(season, human).flatMap(id => {
   const printed = profiles.get(id);
   if (!printed) return [];
   const now = developed(printed, season.upgrades, stop);
   if (!canTrain(now, kind, season.upgrades)) return [];
   const after = train(now, kind);
   const gain = kind === 'hitting' || kind === 'hotBat' ? woba(after.battingRates!) - woba(now.battingRates!)
    : kind === 'pitching' || kind === 'hotArm' ? woba(now.pitchingRates!) - woba(after.pitchingRates!) : 0;
   return [{ id, name: printed.displayName, before: statLine(now, kind), after: kind === 'recovery' ? 'quick recovery' : statLine(after, kind), gain, done: trainedThisVisit(season, id), reason: refusal(run, season, human, printed, kind) }];
  }).sort((a, b) => b.gain - a.gain || a.name.localeCompare(b.name));
 });

 async function buy(id: string) {
  notice = (await onTrain(id, chosen)) ?? '';
 }
</script>

<section class="shop" aria-labelledby="shop-heading">
 <div class="head">
  <h3 id="shop-heading">Training</h3>
  <p class="bank">Bank <strong>{cash}</strong></p>
 </div>
 <div class="kinds" role="radiogroup" aria-label="Training">
  {#each offers as kind, index (kind)}
   <button type="button" role="radio" aria-checked={chosen === kind} class:special={index >= 4} onclick={() => { chosen = kind; notice = ''; }}>
    <span>{TRAININGS[kind].name}</span><small>{TRAININGS[kind].price}</small>
   </button>
  {/each}
 </div>
 <p class="detail">{TRAININGS[chosen].detail}. One training per player per stop.</p>
 {#if chosen === 'fielding'}<p class="detail">Glove: 50 is a median fielder at the position, 100 elite.</p>{/if}
 {#if notice}<p class="notice" role="status">{notice}</p>{/if}
 {#if rows.length}
  <ul aria-label={`${TRAININGS[chosen].name} for your players`}>
   {#each rows as row (row.id)}
    <li>
     <span class="who">{row.name}<small>{row.before} → <strong>{row.after}</strong></small></span>
     <button type="button" class="buy" disabled={working || !!row.reason} title={row.reason ?? ''} aria-label={`Train ${row.name}: ${TRAININGS[chosen].name}`} onclick={() => void buy(row.id)}>
      {row.done ? 'Trained' : `Buy ${TRAININGS[chosen].price}`}
     </button>
    </li>
   {/each}
  </ul>
 {:else}<p class="detail">No player on your roster can take this training.</p>{/if}
</section>

<style>
 .shop { display: grid; gap: var(--space-3); min-width: 0; }
 .head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
 h3 { margin: 0; font-size: var(--text-lg); }
 p { margin: 0; }
 .bank { color: var(--muted); font-size: var(--text-sm); }
 .bank strong { color: var(--text); font-variant-numeric: tabular-nums; }
 .kinds { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: var(--space-1); }
 .kinds button { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); min-height: 44px; padding-inline: var(--space-3); font-size: var(--text-xs); text-align: left; }
 .kinds button small { color: var(--muted); font-variant-numeric: tabular-nums; }
 .kinds button.special { border-color: var(--accent); }
 .kinds button[aria-checked='true'] { background: var(--text); color: var(--background); }
 .kinds button[aria-checked='true'] small { color: inherit; }
 .detail, .notice { color: var(--muted); font-size: var(--text-sm); }
 .notice { color: var(--error); }
 ul { margin: 0; padding: 0; list-style: none; max-height: 20rem; overflow-y: auto; overscroll-behavior: contain; border-top: 1px solid var(--border); }
 li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); min-height: 2.75rem; padding: var(--space-1) 0; border-bottom: 1px solid color-mix(in oklch, var(--border) 58%, transparent); font-size: var(--text-sm); }
 .who { min-width: 0; overflow-wrap: anywhere; line-height: 1.25; }
 small { display: block; color: var(--muted); font-size: var(--text-xs); }
 .who strong { color: var(--success); font-weight: 650; }
 .buy { min-height: 2.25rem; padding-inline: var(--space-3); border: 1px solid var(--accent); background: transparent; color: var(--accent); font-size: var(--text-xs); white-space: nowrap; }
 .buy:disabled { border-color: var(--border); color: var(--muted); }
</style>
