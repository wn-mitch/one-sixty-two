<script lang="ts">
 import CapBar from './CapBar.svelte';
 import DraftCardTile from './DraftCardTile.svelte';
 import type { CardMediaStatus } from '../../cards/view-model.ts';
 import type { Manifest } from '../../game/types.ts';
 import type { MediaManifest } from '../../media/types.ts';
 import type { WarRankings } from '../../rankings/types.ts';
 import { STACK_ROLES, type StackRole } from '../../draft/cleanup.ts';
 import { arrangeRoster, submissionFrom } from '../../draft/legality.ts';
 import { rosterSize } from '../../draft/rules.ts';
 import { ownedBy, windowReport, type DraftRun } from '../../draft/run.ts';
 import type { DraftCard, DraftSlot, LegalityFailure } from '../../draft/types.ts';
 import type { Profile } from '../../game/types.ts';
 import { money } from './format.ts';

 let { run, revision, profiles, manifest, media, mediaStatus, rankings = null, clubName, onCut, onCleanup, onAutofix, onSubmit }: {
  run: DraftRun; revision: number; profiles: ReadonlyMap<string, Profile>; clubName: (seat: number) => string;
  manifest: Manifest | null; media: MediaManifest | null; mediaStatus: CardMediaStatus; rankings?: WarRankings | null;
  onCut: (cardId: string) => Promise<void>; onCleanup: (role: StackRole) => Promise<void>; onAutofix: () => Promise<void>;
  onSubmit: (active: Record<DraftSlot, string>, reserves: string[]) => Promise<void>;
 } = $props();
 const human = $derived(run.seating.humanSeat);
 const owned = $derived.by(() => { void revision; return ownedBy(run, human); });
 const arrangement = $derived(arrangeRoster(owned));
 const submission = $derived(submissionFrom(human, arrangement));
 const report = $derived.by(() => { void revision; return windowReport(run, submission); });
 const size = $derived(rosterSize(run.pool.rules));
 const full = $derived(owned.length >= size);
 const tops = $derived.by(() => { void revision; return STACK_ROLES.map(role => ({ role, card: run.pool.cleanup.peek(human, role) })); });
 let working = $state(false);

 function describe(failure: LegalityFailure): string {
  switch (failure.code) {
   case 'missing-role': return `${failure.slot} is empty`;
   case 'ineligible-role': return `${failure.cardId} cannot play ${failure.slot}`;
   case 'reserve-count': return `${failure.expected - failure.actual} reserve spot${failure.expected - failure.actual === 1 ? '' : 's'} open`;
   case 'over-cap': return `${money(failure.excess)} over the cap`;
   case 'cap-below-guarantee': return 'The cap cannot fit a roster of commons';
   default: return failure.code.replaceAll('-', ' ');
  }
 }
 const blockers = $derived([
  // Empty slots collapse into one item; their open frames already show where they are.
  ...(() => {
   const empty = report.failures.flatMap(failure => failure.code === 'missing-role' ? [failure.slot] : []);
   return empty.length ? [`Empty: ${empty.join(', ')}`] : [];
  })(),
  ...report.failures.filter(failure => failure.code !== 'missing-role').map(describe),
  ...(arrangement.surplus.length ? [`${arrangement.surplus.length} card${arrangement.surplus.length === 1 ? ' has' : 's have'} no roster spot; cut ${arrangement.surplus.length === 1 ? 'it' : 'them'}`] : [])
 ]);
 const nameOf = (card: DraftCard) => profiles.get(card.seasonId)?.displayName ?? card.playerId;
 const byId = $derived(new Map(owned.map(card => [card.seasonId, card])));
 /** Every roster place in order: filled active slots and reserves as cards, open ones as empty frames, then cards with no place. */
 const places = $derived([
  ...Object.entries(arrangement.active).map(([slot, id]) => ({ label: slot, card: byId.get(id!) ?? null, extra: false })),
  ...arrangement.open.map(row => ({ label: row ?? 'Res', card: null, extra: false })),
  ...arrangement.reserves.map(id => ({ label: 'Res', card: byId.get(id) ?? null, extra: false })),
  ...arrangement.surplus.map(id => ({ label: 'Extra', card: byId.get(id) ?? null, extra: true }))
 ]);

 async function step(action: () => Promise<void>) {
  working = true;
  try { await action(); } finally { working = false; }
 }
</script>

<div class="window">
 <header class="status">
  <div>
   <h1>Opening window</h1>
   <p>{clubName(human)} · {owned.length} of {size} cards · cut, take cleanup commons, then submit a legal roster</p>
  </div>
  <CapBar payroll={report.payroll} cap={report.effectiveCap} />
 </header>

 <div class="columns">
  <section aria-labelledby="roster-heading">
   <h2 id="roster-heading">Your roster</h2>
   <div class="cards">
    {#each places as place, index (place.card?.seasonId ?? `open-${place.label}-${index}`)}
     <div class="place" class:extra={place.extra}>
      <div class="place-head">
       <span class="slot">{place.label}</span>
       {#if place.card}<button class="quiet" disabled={working} aria-label={`Cut ${nameOf(place.card)}`} onclick={() => step(() => onCut(place.card!.seasonId))}>Cut</button>{/if}
      </div>
      {#if place.card}
       <DraftCardTile card={place.card} profile={profiles.get(place.card.seasonId)} {manifest} {media} {mediaStatus} {rankings} compact />
      {:else}<div class="open-frame">Open {place.label === 'Res' ? 'reserve' : place.label}</div>{/if}
     </div>
    {/each}
   </div>
  </section>

  <section aria-labelledby="cleanup-heading">
   <h2 id="cleanup-heading">Cleanup commons</h2>
   <p class="note">Each stack shows its top card. Commons cost at most {money(run.pool.rules.commonSalaryMax)}.{#if full}{' '}Your roster is full; cut a card to take another.{/if}</p>
   <div class="cards">
    {#each tops as { role, card } (role)}
     <div class="place stack">
      <div class="place-head">
       <span class="slot">{role} stack</span>
       {#if card}<button class="quiet take" disabled={working || full} aria-label={`Take ${nameOf(card)} from the ${role} stack`} onclick={() => step(() => onCleanup(role))}>Take</button>{/if}
      </div>
      {#if card}
       <DraftCardTile {card} profile={profiles.get(card.seasonId)} {manifest} {media} {mediaStatus} {rankings} compact />
      {:else}<div class="open-frame">Empty</div>{/if}
     </div>
    {/each}
   </div>
  </section>
 </div>

 <footer class="submit">
  <div class="checklist" aria-live="polite">
   {#if blockers.length}
    <p class="label">Before you submit</p>
    <ul>{#each blockers as blocker (blocker)}<li>{blocker}</li>{/each}</ul>
   {:else}<p class="ready">Roster is legal.</p>{/if}
  </div>
  <div class="buttons">
   <button disabled={working} onclick={() => step(onAutofix)}>Auto-fix</button>
   <button class="primary" disabled={working || blockers.length > 0} onclick={() => step(() => onSubmit(submission.active as Record<DraftSlot, string>, submission.reserves))}>Submit roster</button>
  </div>
 </footer>
</div>

<style>
 .window > * { min-width: 0; }
 .window { display: grid; gap: var(--space-6); }
 .status { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--space-4); padding-bottom: var(--space-3); border-bottom: 1px solid var(--border); }
 h1 { margin: 0; font-size: var(--text-xl); }
 h2 { margin: 0 0 var(--space-3); font-size: var(--text-base); }
 .status p, .note { margin: 0; color: var(--muted); font-size: var(--text-sm); }
 .note { margin-bottom: var(--space-3); }
 .columns { display: grid; gap: var(--space-8); }
 @media (min-width: 56rem) { .columns { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); } }
 .quiet { background: transparent; min-height: 2.25rem; padding-inline: var(--space-3); font-size: var(--text-xs); }
 .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: var(--space-4) var(--space-3); }
 .place { display: grid; gap: var(--space-2); align-content: start; min-width: 0; }
 .place-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); min-height: 2rem; }
 .place-head .quiet { min-height: 2rem; padding: 0 var(--space-3); border: 1px solid var(--border); }
 .place-head .take { border-color: var(--accent); color: var(--accent); }
 .slot { color: var(--muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
 .extra .slot { color: var(--error); }
 .open-frame { display: grid; place-items: center; aspect-ratio: 5 / 7; border: 2px dashed var(--border); border-radius: var(--radius-lg); color: var(--muted); font-size: var(--text-xs); text-align: center; }
 .submit { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) 0 calc(var(--space-3) + env(safe-area-inset-bottom)); background: var(--background); border-top: 1px solid var(--border); }
 .checklist { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); min-width: 0; flex: 1; }
 .checklist p { margin: 0; font-size: var(--text-sm); }
 .checklist .label { color: var(--muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
 .checklist ul { display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-2); margin: 0; padding: 0; list-style: none; }
 .checklist li { padding: .15rem .55rem; border-radius: 999px; background: color-mix(in oklch, var(--error) 16%, transparent); color: var(--error); font-size: var(--text-xs); font-weight: 650; }
 .ready { color: var(--success); }
 .buttons { display: flex; gap: var(--space-2); }
 @media (max-width: 40rem) {
  .submit { flex-direction: column; align-items: stretch; gap: var(--space-2); }
  .checklist .label { display: none; }
  .checklist li { border-radius: .4rem; }
  .buttons > * { flex: 1; }
 }
</style>
