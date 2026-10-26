<script lang="ts">
 import type { Profile } from '../../game/types.ts';
 import { availability, fieldedLineup, MAJOR_SHARE, pushAt, pushBackups, pushCandidates, pushChance, pushRefusal, PUSHES, segmentGames, type PushKind, type Substitution } from '../../draft/injuries.ts';
 import type { LeagueSeason } from '../../draft/league.ts';
 import type { DraftRun } from '../../draft/run.ts';
 import { LEAGUE_SEGMENTS } from '../../sim/league-types.ts';

 /**
  * A stop's health report and push offers. Injuries list who misses or plays hurt through the next
  * nine games and who covers for them; each push states its benefit, its chance of injury, what an
  * injury would cost and who would replace him, so declining is always an informed choice.
  */
 let { run, season, revision, profiles, working, onPush }: {
  run: DraftRun; season: LeagueSeason; revision: number; profiles: ReadonlyMap<string, Profile>; working: boolean;
  onPush: (cardId: string, kind: PushKind, on: boolean) => void;
 } = $props();
 const human = $derived(run.seating.humanSeat);
 const stop = $derived.by(() => { void revision; return season.segments.length; });
 const [first, last] = $derived(segmentGames(stop));
 const [nextFirst, nextLast] = $derived(segmentGames(stop + 1));
 const nameOf = (id: string) => profiles.get(id)?.displayName ?? run.pool.ledger.cards.get(id)?.playerId ?? id;
 const cover = (sub: Substitution | undefined) => sub ? `${nameOf(sub.in)}${sub.callUp ? ' (emergency call-up)' : ''} would play ${sub.slot}` : 'nobody needs to cover';
 const pct = (chance: number) => `${Math.round(chance * 100)}%`;
 // The season mutates in place, so these re-read it when `revision` moves.
 const hurtList = $derived.by(() => {
  void revision;
  const fielded = fieldedLineup(run, season, human, stop).substitutions;
  return season.injuries.filter(injury => injury.seat === human && injury.segment === stop).map(injury => ({
   ...injury, status: availability(season, injury.cardId, stop), cover: fielded.find(sub => sub.out === injury.cardId),
   playThrough: pushRefusal(run, season, human, injury.cardId, 'playThrough'), through: !!pushAt(season, injury.cardId, 'playThrough', stop),
   risk: pushAt(season, injury.cardId, 'playThrough', stop)?.risk ?? pushChance(season, injury.cardId, 'playThrough')
  }));
 });
 const offers = $derived.by(() => {
  void revision;
  if (stop >= LEAGUE_SEGMENTS) return [];
  const backups = pushBackups(run, season, human);
  return pushCandidates(season, human).map(({ cardId, kind }) => {
   const taken = pushAt(season, cardId, kind, stop);
   return { cardId, kind, taken: !!taken, risk: taken ? taken.risk : pushChance(season, cardId, kind), refusal: pushRefusal(run, season, human, cardId, kind), backup: backups.get(cardId) };
  });
 });
 const CAUSES: Record<PushKind, string> = { intensive: 'intensive training', ride: 'being ridden', skipRest: 'skipping rest', playThrough: 'playing hurt' };
</script>

<section class="health" aria-labelledby="health-heading">
 <h3 id="health-heading">Injuries and pushes</h3>
 {#if hurtList.length}
  <ul aria-label="Injuries">
   {#each hurtList as injury (injury.cardId)}
    <li>
     <span class="who">
      <strong>{nameOf(injury.cardId)}</strong> · {injury.severity} injury from {CAUSES[injury.cause]}
      <small>
       {#if injury.status === 'hurt'}Plays games {first}–{last} hurt: his hitting or pitching gives up a quarter of its edge over a replacement player. A {pct(injury.risk)} chance it turns major and keeps him out of games {nextFirst}–{nextLast}.
       {:else}Out for games {first}–{last}.{#if injury.cover} {cover(injury.cover).replace('would play', 'plays')}.{/if}{#if injury.severity === 'minor'} Playing him through it instead risks {pct(injury.risk)} that it turns major, out games {nextFirst}–{nextLast}.{/if}{/if}
      </small>
     </span>
     {#if injury.severity === 'minor'}
      <button type="button" class="push" class:on={injury.through} disabled={working || (!injury.through && !!injury.playThrough)} title={injury.through ? '' : injury.playThrough ?? ''}
       aria-label={injury.through ? `Rest ${nameOf(injury.cardId)}` : `Play ${nameOf(injury.cardId)} through it`}
       onclick={() => onPush(injury.cardId, 'playThrough', !injury.through)}>{injury.through ? 'Rest him' : 'Play through'}</button>
     {/if}
    </li>
   {/each}
  </ul>
 {:else}<p class="note">No injuries on your club.</p>{/if}

 {#if offers.length}
  <p class="note">A push buys an edge for games {first}–{last} at a risk: 1 in 8, plus 1 in 16 for each earlier push on the same player this chapter. Of injuries, {Math.round((1 - MAJOR_SHARE) * 4)} in 4 are minor (he sits games {nextFirst}–{nextLast}, or plays them hurt) and 1 in 4 major (out games {nextFirst}–{nextLast}). Declining every push is always safe.</p>
  <ul aria-label="Pushes">
   {#each offers as offer (`${offer.kind}:${offer.cardId}`)}
    <li>
     <span class="who">
      <strong>{nameOf(offer.cardId)}</strong> · {PUSHES[offer.kind].name}
      <small>{PUSHES[offer.kind].benefit}. {offer.risk > 0 ? `${pct(offer.risk)} injury risk; if hurt, ${cover(offer.backup)}.` : 'No risk: the season ends with these games.'}</small>
     </span>
     <button type="button" class="push" class:on={offer.taken} disabled={working || (!offer.taken && !!offer.refusal)} title={offer.taken ? '' : offer.refusal ?? ''}
      aria-label={`${offer.taken ? 'Call off' : 'Take'} ${PUSHES[offer.kind].name.toLowerCase()} for ${nameOf(offer.cardId)}`}
      onclick={() => onPush(offer.cardId, offer.kind, !offer.taken)}>{offer.taken ? 'On · undo' : offer.kind === 'ride' ? 'Ride' : 'Skip rest'}</button>
    </li>
   {/each}
  </ul>
 {/if}
</section>

<style>
 .health { display: grid; gap: var(--space-2); min-width: 0; }
 h3 { margin: 0; font-size: var(--text-lg); }
 .note { margin: 0; color: var(--muted); font-size: var(--text-sm); }
 ul { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--border); }
 li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); min-height: 2.75rem; padding: var(--space-2) 0; border-bottom: 1px solid color-mix(in oklch, var(--border) 58%, transparent); font-size: var(--text-sm); }
 .who { min-width: 0; overflow-wrap: anywhere; line-height: 1.3; }
 small { display: block; color: var(--muted); font-size: var(--text-xs); }
 .push { min-height: 2.25rem; padding-inline: var(--space-3); border: 1px solid var(--accent); background: transparent; color: var(--accent); font-size: var(--text-xs); white-space: nowrap; }
 .push.on { background: var(--accent); color: var(--background); }
 .push:disabled { border-color: var(--border); color: var(--muted); }
</style>
