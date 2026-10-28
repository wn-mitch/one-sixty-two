<script lang="ts">
 import ResultsReward from '../ResultsReward.svelte';
 import ResultsScoreboard from '../ResultsScoreboard.svelte';
 import SeasonTotals from '../SeasonTotals.svelte';
 import GameBoxScore from '../GameBoxScore.svelte';
 import StickerBadge from '../../collection/StickerBadge.svelte';
 import { STICKER_BY_KIND } from '../../collection/stickers.ts';
 import type { NewSticker } from '../../collection/collection.ts';
 import type { SeasonReward } from '../../cosmetics/ledger.ts';
 import Standings from './Standings.svelte';
 import { segmentDecree } from '../../draft/decrees.ts';
 import { headToHead, seasonLines, standings, type LeagueSeason } from '../../draft/league.ts';
 import { momentTitle, type DraftMoment } from '../../draft/moments.ts';
 import { finishGrade, finishTokens } from '../../draft/report.ts';
 import type { DraftRun } from '../../draft/run.ts';

 /**
  * The finished league season in the Results layout: the record, grade and its facts, the tokens and
  * stickers it earned, the final standings, the season's best and worst games, then the club's totals.
  */
 let { run, season, clubName, onNew, reward = null, earned = [], onShare, onCard }: {
  run: DraftRun; season: LeagueSeason; clubName: (seat: number) => string; onNew: () => void; reward?: SeasonReward | null; earned?: readonly NewSticker[];
  /** Publishes the season and resolves to its link. */
  onShare?: () => Promise<string>;
  /** Draws the season's card image. */
  onCard?: () => Promise<Blob>;
 } = $props();
 let link = $state<string | null>(null);
 let shareStatus = $state('');
 let working = $state(false);
 async function share(): Promise<void> {
  if (!onShare || working) return;
  working = true;
  shareStatus = 'Publishing…';
  try {
   link = await onShare();
   try { await navigator.clipboard.writeText(link); shareStatus = 'Link copied.'; } catch { shareStatus = 'Copy the link below.'; }
  } catch (error) { shareStatus = error instanceof Error ? error.message : 'The season could not be shared. Please retry.'; }
  finally { working = false; }
 }
 async function download(): Promise<void> {
  if (!onCard || working) return;
  working = true;
  shareStatus = 'Drawing the card…';
  try {
   const url = URL.createObjectURL(await onCard());
   const anchor = Object.assign(document.createElement('a'), { href: url, download: `162-0-draft-${run.setup.seed}.png` });
   anchor.click();
   setTimeout(() => URL.revokeObjectURL(url), 10_000);
   shareStatus = 'Card downloaded.';
  } catch (error) { shareStatus = error instanceof Error ? error.message : 'The card could not be drawn.'; }
  finally { working = false; }
 }
 const human = $derived(run.seating.humanSeat);
 const rival = $derived(season.rivals.find(pair => pair.includes(human))!.find(seat => seat !== human)!);
 const table = $derived(standings(season));
 const mine = $derived(table.find(row => row.seat === human)!);
 const place = $derived(table.indexOf(mine) + 1);
 const champion = $derived(table[0]);
 const grade = $derived(finishGrade(table, human));
 const series = $derived(headToHead(season, human, rival));
 const lines = $derived(seasonLines(season, human));
 const difference = $derived(mine.runsFor - mine.runsAgainst);
 const ordinal = (value: number) => `${value}${value === 1 ? 'st' : value === 2 ? 'nd' : value === 3 ? 'rd' : 'th'}`;
 // The league sticker goes on every card of the final roster, so it reads once for the club.
 const stickers = $derived([...Map.groupBy(earned, item => item.kind)].map(([kind, items]) => ({ definition: STICKER_BY_KIND.get(kind)!, count: items.length })).filter(item => item.definition));
 const moments = $derived([['Highlight', season.moments.highlight], ['Lowlight', season.moments.lowlight]].filter((entry): entry is [string, DraftMoment] => !!entry[1]));
</script>

<section class="report" aria-labelledby="results-heading">
 <ResultsScoreboard wins={mine.wins} losses={mine.losses}>
  {#snippet record()}
   <p class="headline">{champion.seat === human ? `${clubName(human)} won the league.` : `${clubName(champion.seat)} won the league at ${champion.wins}–${champion.losses}.`}{mine.wins === 162 ? ' 162-0.' : ''}</p>
   <dl class="season-ledger">
    <div><dt>Grade</dt><dd aria-label={`Grade ${grade}, from a ${ordinal(place)}-place finish`}>{grade}</dd></div>
    <div><dt>Finish</dt><dd>{ordinal(place)} of {table.length}</dd></div>
    <div><dt>vs {clubName(rival)}</dt><dd>{series.wins}–{series.losses}</dd></div>
    <div>
     <dt>Runs</dt>
     <dd aria-label={`${mine.runsFor} scored, ${mine.runsAgainst} allowed, difference ${difference > 0 ? '+' : ''}${difference}`}>{mine.runsFor}–{mine.runsAgainst} <span class="run-difference" class:up={difference > 0} class:down={difference < 0}>{difference > 0 ? '+' : difference < 0 ? '−' : '±'}{Math.abs(difference)}</span></dd>
    </div>
   </dl>
  {/snippet}
  {#snippet actions()}
   <button class="primary" type="button" onclick={onNew}><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 3.5v9M3.5 8h9"></path></svg>New draft</button>
   <ResultsReward {reward} ownSeason={!!reward} />
  {/snippet}
 </ResultsScoreboard>

 <section class="block" aria-labelledby="earned-heading">
  <h3 id="earned-heading">Earned</h3>
  <p class="muted">{finishTokens(place)} {finishTokens(place) === 1 ? 'token' : 'tokens'}: one for finishing{place <= 4 ? ', one for a top-half finish' : ''}{place === 1 ? ', one for the title' : ''}. Grade by finish: a runaway champion earns S+, the champion S, then AA, A, B, C, C, D and F down the table.</p>
  {#if stickers.length}
   <ul class="stickers" aria-label="League stickers">
    {#each stickers as { definition, count } (definition.kind)}
     <li><span class="badge" aria-hidden="true"><StickerBadge {definition} /></span>{definition.title}<span class="muted">{` · on ${count} ${count === 1 ? 'card' : 'cards'} in your collection`}</span></li>
    {/each}
   </ul>
  {/if}
 </section>

 {#if onShare || onCard}
  <section class="block" aria-labelledby="share-heading">
   <h3 id="share-heading">Share</h3>
   <p class="muted">Publish a read-only page of this season: the standings, moments, final roster and the run's seed and versions. It is a snapshot, not a replay.</p>
   <div class="share-actions">
    {#if onShare}<button type="button" class="secondary" disabled={working} onclick={share}>Copy link</button>{/if}
    {#if onCard}<button type="button" class="secondary" disabled={working} onclick={download}>Download card</button>{/if}
   </div>
   <p class="muted" role="status">{shareStatus}</p>
   {#if link}<a class="share-link" href={link}>{link}</a>{/if}
  </section>
 {/if}

 <section class="block" aria-labelledby="final-heading">
  <h3 id="final-heading">Final standings</h3>
  <Standings rows={table} {human} {rival} {clubName} />
 </section>

 {#if moments.length}
  <section class="block" aria-labelledby="moments-heading">
   <h3 id="moments-heading">Season moments</h3>
   {#each moments as [kind, moment] (kind)}
    <article class="moment" aria-label={`${kind}: ${momentTitle(moment)}`}>
     <p class="kicker">{kind}</p>
     <h4>{momentTitle(moment)}</h4>
     <p class="muted">Played under {segmentDecree(run.setup.seed, moment.segment).name}.</p>
     <GameBoxScore game={moment.game} label={`${kind} game`} idPrefix={`moment-${kind.toLowerCase()}`} collapseBoxes />
    </article>
   {/each}
  </section>
 {/if}

 <section class="block season-review" aria-labelledby="season-review-heading">
  <h3 id="season-review-heading">Season in review</h3>
  <SeasonTotals batting={lines.batting} pitching={lines.pitching} relievers="named relievers" />
 </section>
</section>

<style>
 .report { display: grid; gap: var(--space-8); min-width: 0; }
 .report > * { min-width: 0; }
 .headline { flex: 1 1 16rem; margin: 0; color: var(--muted); font-size: var(--text-sm); }
 .block { display: grid; gap: var(--space-3); min-width: 0; }
 .season-review { gap: var(--space-6); padding-top: var(--space-5); border-top: 1px solid var(--border); }
 h3 { margin: 0; font-size: var(--text-xl); }
 h4 { margin: 0; font-size: var(--text-lg); }
 .muted { margin: 0; color: var(--muted); font-size: var(--text-sm); }
 .kicker { margin: 0; color: var(--muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
 .moment { display: grid; gap: var(--space-1); min-width: 0; padding-top: var(--space-4); border-top: 1px solid var(--border); }
 .stickers { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
 .stickers li { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }
 .share-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
 .share-link { overflow-wrap: anywhere; font-size: var(--text-sm); }
 .badge { flex: none; font-size: .08rem; padding: .15rem; line-height: 0; }
</style>
