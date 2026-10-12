<script lang="ts">
 import CapBar from './CapBar.svelte';
 import ClubRoster from './ClubRoster.svelte';
 import { STACK_ROLES, type StackRole } from '../../draft/cleanup.ts';
 import { arrangeRoster, submissionFrom } from '../../draft/legality.ts';
 import { rosterSize } from '../../draft/rules.ts';
 import { ownedBy, windowReport, type DraftRun } from '../../draft/run.ts';
 import type { DraftCard, DraftSlot, LegalityFailure } from '../../draft/types.ts';
 import type { Profile } from '../../game/types.ts';
 import { money } from './format.ts';

 let { run, revision, profiles, clubName, onCut, onCleanup, onAutofix, onSubmit }: {
  run: DraftRun; revision: number; profiles: ReadonlyMap<string, Profile>; clubName: (seat: number) => string;
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
  ...report.failures.map(describe),
  ...(arrangement.surplus.length ? [`${arrangement.surplus.length} card${arrangement.surplus.length === 1 ? ' has' : 's have'} no roster spot; cut ${arrangement.surplus.length === 1 ? 'it' : 'them'}`] : [])
 ]);
 const nameOf = (card: DraftCard) => profiles.get(card.seasonId)?.displayName ?? card.playerId;

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
   <ClubRoster cards={owned} {profiles}>
    {#snippet action(card)}
     <button class="quiet" disabled={working} aria-label={`Cut ${nameOf(card)}`} onclick={() => step(() => onCut(card.seasonId))}>Cut</button>
    {/snippet}
   </ClubRoster>
  </section>

  <section aria-labelledby="cleanup-heading">
   <h2 id="cleanup-heading">Cleanup commons</h2>
   <p class="note">Each stack shows its top card. Commons cost at most {money(run.pool.rules.commonSalaryMax)}.{#if full}{' '}Your roster is full; cut a card to take another.{/if}</p>
   <ul class="stacks">
    {#each tops as { role, card } (role)}
     <li>
      <span class="slot">{role}</span>
      {#if card}
       <span class="who">{nameOf(card)} <small>{card.year} · {money(card.salary)}</small></span>
       <button disabled={working || full} aria-label={`Take ${nameOf(card)} from the ${role} stack`} onclick={() => step(() => onCleanup(role))}>Take</button>
      {:else}<span class="who empty">Empty</span>{/if}
     </li>
    {/each}
   </ul>
  </section>
 </div>

 <footer class="submit">
  <div class="checklist" aria-live="polite">
   {#if blockers.length}
    <p>Before you submit:</p>
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
 .stacks { list-style: none; margin: 0; padding: 0; display: grid; }
 .stacks li { display: grid; grid-template-columns: 2.75rem minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); min-height: 3rem; border-bottom: 1px solid color-mix(in oklch, var(--border) 58%, transparent); font-size: var(--text-sm); }
 .slot { color: var(--muted); font-size: var(--text-xs); font-weight: 700; }
 .who { min-width: 0; overflow-wrap: anywhere; line-height: 1.25; }
 small { display: block; color: var(--muted); font-size: var(--text-xs); }
 .empty { color: var(--muted); }
 .submit { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) 0 calc(var(--space-3) + env(safe-area-inset-bottom)); background: var(--background); border-top: 1px solid var(--border); }
 .checklist p { margin: 0; font-size: var(--text-sm); }
 .checklist ul { margin: var(--space-1) 0 0; padding-left: var(--space-5); color: var(--error); font-size: var(--text-sm); }
 .ready { color: var(--success); }
 .buttons { display: flex; gap: var(--space-2); }
</style>
