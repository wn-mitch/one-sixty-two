<script lang="ts">
 import { cubicOut } from 'svelte/easing';
 import Card from '../../cards/Card.svelte';
 import { materialFor } from '../../cards/finish.ts';
 import { createCardViewModel, type CardMediaStatus } from '../../cards/view-model.ts';
 import { explainPick } from '../../draft/ai.ts';
 import type { DraftRun } from '../../draft/run.ts';
 import { appSettings } from '../../game/settings.svelte.ts';
 import type { Manifest, Profile } from '../../game/types.ts';
 import type { MediaManifest } from '../../media/types.ts';
 import type { WarRankings } from '../../rankings/types.ts';
 import TeamLogo from '../TeamLogo.svelte';

 /**
  * The table around you: every other club's seat with the card it took in the last round. Each
  * round's cards deal down from above into their seats in turn, so the picks read like cards
  * passed around a table rather than a log.
  */
 let { run, revision, profiles, manifest, media, mediaStatus, rankings = null, clubName }: {
  run: DraftRun; revision: number; profiles: ReadonlyMap<string, Profile>;
  manifest: Manifest | null; media: MediaManifest | null; mediaStatus: CardMediaStatus; rankings?: WarRankings | null;
  clubName: (seat: number) => string;
 } = $props();
 const human = $derived(run.seating.humanSeat);
 /** The latest round's picks by seat, skipping your own. */
 const round = $derived.by(() => {
  void revision;
  const last = run.ticker.at(-1)?.pick;
  return last === undefined ? [] : run.ticker.filter(entry => entry.pick === last && entry.seat !== human);
 });
 const seats = $derived(run.seating.seats.map((franchiseId, seat) => ({ franchiseId, seat })).filter(item => item.seat !== human));
 const view = (cardId: string) => {
  const profile = profiles.get(cardId);
  const card = run.pool.ledger.cards.get(cardId);
  if (!profile || !card) return null;
  return { ...createCardViewModel({ profile, slot: card.pricedSlot, manifest, media, mediaStatus, rankings }), fin: materialFor(card.finish) };
 };

 /** A card dropped from above the table, turning flat as it lands in its seat. */
 function deal(_: Element, { order }: { order: number }) {
  const motion = appSettings.effectiveEnabled;
  const tilt = order % 2 ? 9 : -9;
  return {
   delay: motion ? order * 70 : 0,
   duration: motion ? 520 : 0,
   easing: cubicOut,
   css: (t: number, u: number) => `transform: translateY(${-160 * u}px) rotate(${tilt * u}deg) scale(${1 + .25 * u}); opacity: ${Math.min(1, t * 2.5)};`
  };
 }
</script>

{#if round.length}
 <section class="deal" aria-labelledby="deal-heading">
  <h2 id="deal-heading">Round {round[0].pick + 1} around the table</h2>
  <ol class="seats" style:--seats={seats.length}>
   {#each seats as { franchiseId, seat }, order (seat)}
    {@const entry = round.find(item => item.seat === seat)}
    <li class="seat">
     <div class="slot">
      {#if entry}
       {#key `${entry.pick}:${seat}`}
        {@const face = view(entry.cardId)}
        <div class="dealt" in:deal|global={{ order }} title={entry.reason ? explainPick(entry.reason) : undefined}>
         {#if face}<Card s={face} face="front" thumbnail interactive={false} onDetails={() => {}} />{:else}<span class="blank"></span>{/if}
        </div>
       {/key}
      {:else}<span class="blank"></span>{/if}
     </div>
     <p class="club"><TeamLogo {franchiseId} label={clubName(seat)} size="small" /><span>{clubName(seat)}</span></p>
     {#if entry}<p class="took">{profiles.get(entry.cardId)?.displayName ?? run.pool.ledger.cards.get(entry.cardId)?.playerId ?? entry.cardId}</p>{/if}
    </li>
   {/each}
  </ol>
 </section>
{/if}

<style>
 .deal { min-width: 0; }
 h2 { margin: 0 0 var(--space-2); color: var(--muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
 /* Phones scroll the table sideways; wide screens fit every seat. */
 .seats { display: grid; grid-auto-flow: column; grid-auto-columns: 5.25rem; gap: var(--space-3); margin: 0; padding: var(--space-1) 0 var(--space-2); list-style: none; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x proximity; }
 @media (min-width: 40rem) { .seats { grid-auto-flow: row; grid-template-columns: repeat(var(--seats), minmax(0, 1fr)); overflow: visible; } }
 .seat { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-1); align-content: start; min-width: 0; scroll-snap-align: start; }
 .slot { width: 100%; min-width: 0; aspect-ratio: 5 / 7; contain: inline-size; border: 1px dashed var(--border); border-radius: var(--radius); }
 .dealt { display: block; width: 100%; min-width: 0; }
 .blank { display: block; height: 100%; }
 .club { display: flex; align-items: center; gap: var(--space-1); margin: 0; font-size: var(--text-xs); font-weight: 650; }
 .club span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
 .took { margin: 0; overflow: hidden; color: var(--muted); font-size: var(--text-xs); text-overflow: ellipsis; white-space: nowrap; }
</style>
