<script lang="ts">
 import { onMount } from 'svelte';
 import { average, historicalBatting, historicalEra, innings } from '../game/format.ts';
 import { compareId, POSITIONS } from '../game/types.ts';
 import type { Profile, Slot } from '../game/types.ts';
 import { loadMedia, selectLogo, selectPhoto } from '../media/client.ts';
 import type { MediaManifest } from '../media/types.ts';
 import AtmosphereImage from './AtmosphereImage.svelte';
 import { isHitter } from './candidate-ranking.ts';
 import PlayerPhoto from './PlayerPhoto.svelte';
 import { seasonEstimates } from './season-estimates.ts';
 import TeamLogo from './TeamLogo.svelte';

 let {
  profile,
  seasons,
  onSeasonChange,
  legalSlots,
  assignedSlot,
  war,
  selected = false,
  compact = false,
  onChoose
 }: {
  profile: Profile;
  seasons?: Profile[];
  onSeasonChange?: (seasonId: string) => void;
  legalSlots?: readonly Slot[];
  assignedSlot?: Slot;
  war?: number | null;
  selected?: boolean;
  compact?: boolean;
  onChoose?: () => void;
 } = $props();

 const uid = $props.id();
 let details = $state(false);
 let media = $state.raw<MediaManifest | null>(null);
 let mediaUnavailable = $state(false);

 const era = $derived(Math.floor(profile.year / 10) * 10);
 const seasonChoices = $derived.by(() => {
  const unique = new Map<string, Profile>();
  for (const season of seasons?.length ? seasons : [profile]) unique.set(season.seasonId, season);
  if (!unique.has(profile.seasonId)) unique.set(profile.seasonId, profile);
  return [...unique.values()].sort((a, b) => a.year - b.year || compareId(a.seasonId, b.seasonId));
 });
 const hitterSeason = $derived(profile.eligibleSlots.some(isHitter));
 const pitcherSeason = $derived(profile.eligibleSlots.some(slot => !isHitter(slot)));
 const batting = $derived(profile.batting && hitterSeason ? historicalBatting(profile.batting) : null);
 const pitching = $derived(profile.pitching && pitcherSeason ? profile.pitching : null);
 const primaryRole = $derived.by(() => {
  if (assignedSlot) return isHitter(assignedSlot) ? 'batting' : 'pitching';
  return hitterSeason ? 'batting' : 'pitching';
 });
 const available = $derived(legalSlots ? profile.eligibleSlots.filter(slot => legalSlots.includes(slot)) : []);
 const appearances = $derived(POSITIONS.flatMap(position => {
  const games = profile.appearances[position];
  return games === undefined ? [] : [{ position, games }];
 }));
 const notes = $derived(seasonEstimates(profile, profile.eligibleSlots, assignedSlot ?? null));
 const photo = $derived(profile.bullpen ? null : selectPhoto(media, profile.playerId, profile.year));
 const mark = $derived(selectLogo(media, profile.franchiseId, profile.year));
 const markLabel = $derived(mark?.historical ? 'Verified historical team mark' : mark ? 'Current franchise mark' : 'Team identity');
 const teamColor = $derived(media?.teams[profile.franchiseId]?.color ?? 'oklch(48% .08 225)');
 const faceId = $derived(`${uid}-${details ? 'back' : 'front'}`);
 const warText = $derived(typeof war === 'number' && Number.isFinite(war) ? war.toFixed(2) : 'Unavailable');

 onMount(() => {
  let disposed = false;
  void loadMedia().then(value => { if (!disposed) media = value; }).catch(() => { if (!disposed) mediaUnavailable = true; });
  return () => { disposed = true; };
 });
</script>

<article
 class="player-card"
 class:selected
 class:compact
 data-season-id={profile.seasonId}
 data-era={era}
 style:--club-color={teamColor}
 aria-label={`${profile.year} ${profile.displayName} player card`}
>
 <header class="card-header">
  <div class="season-row">
   {#if onSeasonChange}
    <label class="season-picker">
     <span>Exact season</span>
     <select
      aria-label={`Exact season for ${profile.displayName}`}
      value={profile.seasonId}
      onchange={event => onSeasonChange?.(event.currentTarget.value)}
     >
      {#each seasonChoices as season (season.seasonId)}
       <option value={season.seasonId}>{season.year} · {season.historicalTeam}</option>
      {/each}
     </select>
    </label>
   {:else}
    <div class="fixed-season"><span>Exact season</span><strong>{profile.year}</strong></div>
   {/if}
   {#if assignedSlot}<span class="assignment">Assigned {assignedSlot}</span>{/if}
  </div>

  <div class="identity-band">
   <div class="team-mark-wrap">
    <TeamLogo franchiseId={profile.franchiseId} year={profile.year} label={profile.historicalTeam} size={compact ? 'small' : 'medium'} />
    <span>{markLabel}</span>
   </div>
   <div class="team-copy">
    <p class="player-name">{profile.displayName}</p>
    <p class="historical-team">{profile.year} · {profile.historicalTeam} · {profile.league}</p>
   </div>
  </div>

  <div class="qualification" aria-label="Season qualifications and availability">
   <div role="group" aria-label="Qualifies for"><span class="qualification-label">Qualifies for</span><span class="slot-list">{#each profile.eligibleSlots as slot}<span class:available-slot={legalSlots?.includes(slot)} class:assigned-slot={assignedSlot === slot}>{slot}</span>{/each}</span></div>
   {#if legalSlots !== undefined}
    <div role="group" aria-label="Available now"><span class="qualification-label">Available now</span><strong>{available.length ? available.join(' · ') : 'None'}</strong></div>
    {#if available.length === 0}<p>Reassign your roster to make room.</p>{/if}
   {/if}
  </div>

  <div class="card-actions">
   <button type="button" class="face-toggle" aria-expanded={details} aria-controls={faceId} onclick={() => details = !details}>{details ? 'Front' : 'Details'}</button>
   {#if onChoose}
    <button type="button" class="choose" data-choose-season={profile.seasonId} aria-pressed={selected} onclick={onChoose}>{selected ? 'Clear selection' : `Choose ${profile.year}`}</button>
   {/if}
  </div>
 </header>

 {#if details}
  <section class="card-face back" id={faceId} aria-label={`${profile.year} ${profile.displayName} card details`}>
   {#if profile.batting && batting}
    <section class="stat-section">
     <h3>Historical batting</h3>
     <dl class="full-stats" aria-label="Full historical batting statistics">
      <div><dt>AVG</dt><dd>{average(batting.avg)}</dd></div><div><dt>OBP</dt><dd>{average(batting.obp)}</dd></div><div><dt>SLG</dt><dd>{average(batting.slg)}</dd></div><div><dt>OPS</dt><dd>{average(batting.ops)}</dd></div>
      <div><dt>PA</dt><dd>{profile.batting.PA}</dd></div><div><dt>AB</dt><dd>{profile.batting.AB}</dd></div><div><dt>H</dt><dd>{profile.batting.H}</dd></div><div><dt>2B</dt><dd>{profile.batting.doubles}</dd></div><div><dt>3B</dt><dd>{profile.batting.triples}</dd></div><div><dt>HR</dt><dd>{profile.batting.HR}</dd></div>
      <div><dt>BB</dt><dd>{profile.batting.BB}</dd></div><div><dt>HBP</dt><dd>{profile.batting.HBP}</dd></div><div><dt>SO</dt><dd>{profile.batting.SO}</dd></div><div><dt>SH</dt><dd>{profile.batting.SH}</dd></div><div><dt>SF</dt><dd>{profile.batting.SF}</dd></div><div><dt>SB</dt><dd>{profile.batting.SB}</dd></div><div><dt>CS</dt><dd>{profile.batting.CS}</dd></div><div><dt>GIDP</dt><dd>{profile.batting.GIDP}</dd></div>
     </dl>
    </section>
   {/if}

   {#if pitching}
    <section class="stat-section">
     <h3>Historical pitching</h3>
     <dl class="full-stats" aria-label="Full historical pitching statistics">
      <div><dt>ERA</dt><dd>{historicalEra(pitching).toFixed(2)}</dd></div><div><dt>IP</dt><dd>{innings(pitching.IPouts)}</dd></div><div><dt>G</dt><dd>{pitching.G}</dd></div><div><dt>GS</dt><dd>{pitching.GS}</dd></div><div><dt>SV</dt><dd>{pitching.SV}</dd></div><div><dt>BFP</dt><dd>{pitching.BFP}</dd></div>
      <div><dt>H</dt><dd>{pitching.H}</dd></div><div><dt>HR</dt><dd>{pitching.HR}</dd></div><div><dt>BB</dt><dd>{pitching.BB}</dd></div><div><dt>HBP</dt><dd>{pitching.HBP}</dd></div><div><dt>SO</dt><dd>{pitching.SO}</dd></div><div><dt>ER</dt><dd>{pitching.ER}</dd></div>
     </dl>
    </section>
   {/if}

   {#if profile.bullpen}
    <section class="bullpen-composition">
     <h3>Bullpen composition</h3>
     <p>{profile.bullpen.members.length} relief-dominant pitcher-season{profile.bullpen.members.length === 1 ? '' : 's'} included:</p>
     <ul>{#each profile.bullpen.members as member (member.seasonId)}<li>{member.displayName}</li>{/each}</ul>
     <p><strong>Excluded saves leader:</strong> {profile.bullpen.excluded.displayName}.</p>
     <p>The exclusion is determined within this exact team-season by saves, then pitching outs, then season ID. The pool is fixed independently of the closer you draft.</p>
     <p>Source records do not split every starter and relief appearance, so this is a pool of relief-dominant pitcher-seasons, not reconstructed relief-only innings. Throwing handedness is neutral and support workload is unlimited.</p>
     <p class="war-note">No composite WAR or individual WAR applies to this team unit.</p>
    </section>
   {:else if appearances.length}
    <section class="appearances">
     <h3>Position appearances</h3>
     <dl>{#each appearances as appearance}<div><dt>{appearance.position}</dt><dd>{appearance.games} G</dd></div>{/each}</dl>
     <p>Appearances establish historical qualification. They are not defensive-range ratings.</p>
    </section>
   {/if}

   <section class="model-notes">
    <h3>Model notes</h3>
    <p>This historical season is adjusted into the common 2025 environment. WAR/162 ranks choices only and is not a simulation input.</p>
    {#if !profile.bullpen}<p>{primaryRole === 'batting' ? 'Batting' : 'Pitching'} WAR/162: {warText}.</p>{/if}
    {#if !profile.bullpen}<p>Bats: {profile.bats || 'Unknown'} · Throws: {profile.throws || 'Unknown'}.</p>{/if}
    {#if notes.length}<ul>{#each notes as note}<li>{note}</li>{/each}</ul>{:else}<p>No missing-data estimates are flagged for these roles. Shared simulation assumptions still apply.</p>{/if}
    <a href="/about#simulation">How the simulation works</a>
   </section>

   <section class="photo-provenance">
    <h3>Photo and identity sources</h3>
    {#if profile.bullpen}
     <p>No individual portrait is used for this historical team unit.</p>
    {:else if photo}
     <p>Photo {photo.year}{photo.year === profile.year ? ' matches the drafted season.' : ` is a verified playing-career image, not a photo from the drafted ${profile.year} season.`}</p>
     <p>{photo.credit}</p>
     <div class="source-links">
      <a href={photo.sourceUrl} target="_blank" rel="noreferrer">Original photo source</a>
      <a href={photo.licenseUrl} target="_blank" rel="license noreferrer">{photo.license}</a>
      {#if photo.captureEvidenceUrl}<a href={photo.captureEvidenceUrl} target="_blank" rel="noreferrer">Capture-date evidence</a>{/if}
      {#if photo.identityEvidenceUrl}<a href={photo.identityEvidenceUrl} target="_blank" rel="noreferrer">Player-identity evidence</a>{/if}
     </div>
    {:else if mediaUnavailable}
     <p>Image sources are unavailable. The season remains fully draftable.</p>
    {:else if media}
     <p>No verified playing-career photo is published for this player. No substitute face is shown.</p>
    {:else}
     <p role="status">Loading photo provenance.</p>
    {/if}
   </section>
  </section>
 {:else}
  <section class="card-face front" id={faceId} aria-label={`${profile.year} ${profile.displayName} card front`}>
   <div class="photo-stage">
    {#if profile.bullpen}
     <AtmosphereImage franchiseId={profile.franchiseId} {compact} />
     <p class="unit-label">Historical team-season bullpen remainder</p>
    {:else}
     <PlayerPhoto playerId={profile.playerId} year={profile.year} name={profile.displayName} size={compact ? 'small' : 'card'} credits={false} />
    {/if}
   </div>

   <div class="comparison-stats">
    {#if batting}
     <section>
      <h3>Batting</h3>
      <dl aria-label="Batting comparison statistics"><div><dt>OPS</dt><dd>{average(batting.ops)}</dd></div><div><dt>HR</dt><dd>{profile.batting?.HR}</dd></div>{#if primaryRole === 'batting'}<div><dt>Batting WAR/162</dt><dd>{warText}</dd></div>{/if}</dl>
      {#if pitcherSeason && primaryRole !== 'pitching'}<p>Pitching WAR/162 is unavailable in this card context.</p>{/if}
     </section>
    {/if}
    {#if pitching}
     <section>
      <h3>{profile.bullpen ? 'Pooled pitching' : 'Pitching'}</h3>
      <dl aria-label="Pitching comparison statistics"><div><dt>ERA</dt><dd>{historicalEra(pitching).toFixed(2)}</dd></div><div><dt>IP</dt><dd>{innings(pitching.IPouts)}</dd></div>{#if profile.bullpen}<div><dt>SO</dt><dd>{pitching.SO}</dd></div><div><dt>Members</dt><dd>{profile.bullpen.members.length}</dd></div>{:else if primaryRole === 'pitching'}<div><dt>Pitching WAR/162</dt><dd>{warText}</dd></div>{/if}</dl>
      {#if hitterSeason && primaryRole !== 'batting'}<p>Batting WAR/162 is unavailable in this card context.</p>{/if}
      {#if profile.bullpen}<p>No composite WAR is available for team units.</p>{/if}
     </section>
    {/if}
   </div>
  </section>
 {/if}
</article>

<style>
 .player-card {
  --card-stock: oklch(94% .012 235);
  --card-stock-raised: oklch(98% .007 235);
  --card-ink: oklch(22% .018 250);
  --card-muted: oklch(45% .025 250);
  --card-rule: oklch(72% .025 240);
  position: relative;
  isolation: isolate;
  width: 100%;
  max-width: 24rem;
  min-width: 0;
  overflow: hidden;
  color: var(--card-ink);
  background: var(--card-stock);
  border: 1px solid var(--card-rule);
  border-radius: .35rem;
  box-shadow: 0 .7rem 1.5rem oklch(8% .01 255 / .24);
 }
 .player-card:not(.compact) { min-width: min(17rem, 100%); }
 .player-card > * { position: relative; z-index: 1; }
 .player-card.selected { outline: 3px solid var(--focus); outline-offset: 3px; }
 .card-header { display: grid; }
 .season-row { display: flex; align-items: end; justify-content: space-between; gap: .6rem; padding: .7rem .85rem .55rem; }
 .season-picker, .fixed-season { display: grid; gap: .2rem; min-width: 0; }
 .season-picker > span, .fixed-season > span, .qualification-label { color: var(--card-muted); font-size: .7rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
 .season-picker select { width: 100%; min-height: 2.75rem; padding: .4rem 2rem .4rem .55rem; color: var(--card-ink); background: var(--card-stock-raised); border-color: var(--card-rule); font-weight: 750; }
 .fixed-season strong { font-size: 1.25rem; line-height: 1; }
 .assignment { flex: 0 0 auto; padding: .28rem .5rem; color: var(--card-ink); background: color-mix(in oklch, var(--club-color) 18%, var(--card-stock-raised)); border: 1px solid var(--card-rule); border-radius: 999px; font-size: .7rem; font-weight: 750; }
 .identity-band { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: .75rem; padding: .65rem .85rem .8rem; }
 .team-mark-wrap { display: grid; justify-items: center; gap: .18rem; min-width: 3.5rem; }
 .team-mark-wrap > span { max-width: 6rem; color: var(--card-muted); font-size: .58rem; line-height: 1.15; text-align: center; }
 .team-copy { min-width: 0; }
 .player-name { margin: 0; color: var(--card-ink); font-size: 1.45rem; font-weight: 850; letter-spacing: -.035em; line-height: 1.03; overflow-wrap: anywhere; }
 .historical-team { margin: .32rem 0 0; color: var(--card-muted); font-size: .82rem; font-weight: 650; line-height: 1.3; overflow-wrap: anywhere; }
 .qualification { display: grid; gap: .42rem; padding: .65rem .85rem; border-block: 1px solid var(--card-rule); font-size: .76rem; }
 .qualification > div { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem .65rem; }
 .slot-list { display: flex; flex-wrap: wrap; gap: .3rem; }
 .slot-list > span { min-width: 2rem; padding: .16rem .35rem; color: var(--card-muted); background: var(--card-stock-raised); border: 1px solid var(--card-rule); border-radius: .2rem; font-weight: 750; text-align: center; }
 .slot-list > .available-slot, .slot-list > .assigned-slot { color: var(--card-ink); border-color: color-mix(in oklch, var(--club-color) 68%, var(--card-rule)); }
 .qualification p { margin: 0; font-weight: 750; }
 .card-actions { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; padding: .65rem .85rem; }
 .card-actions:has(.face-toggle:only-child) { grid-template-columns: 1fr; }
 .card-actions button { min-height: 2.75rem; color: var(--card-ink); background: var(--card-stock-raised); border-color: var(--card-rule); }
 .card-header :global(:focus-visible), .back :global(:focus-visible) { outline-color: var(--card-ink); }
 .card-actions button:hover:not(:disabled) { background: color-mix(in oklch, var(--club-color) 15%, var(--card-stock-raised)); }
 .card-actions .choose { color: var(--card-stock-raised); background: var(--card-ink); border-color: var(--card-ink); }
 .card-actions .choose:hover:not(:disabled) { background: var(--card-ink); text-decoration: underline; }
 .card-actions .choose[aria-pressed='true'], .card-actions .choose[aria-pressed='true']:hover:not(:disabled) { color: var(--card-ink); background: var(--card-stock-raised); border-color: var(--card-ink); }
 .card-face { padding: .85rem; }
 .photo-stage { min-width: 0; }
 .photo-stage :global(.photo-date) { color: var(--card-muted); }
 .unit-label { margin: .55rem 0 0; color: var(--card-muted); font-size: .75rem; font-weight: 700; }
 .comparison-stats { display: grid; gap: .65rem; margin-top: .8rem; }
 .comparison-stats section, .stat-section, .appearances, .bullpen-composition, .model-notes, .photo-provenance { min-width: 0; padding-top: .75rem; border-top: 1px solid var(--card-rule); }
 .comparison-stats h3, .back h3 { color: var(--card-muted); font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; }
 .comparison-stats dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .45rem; margin: .55rem 0 0; }
 .comparison-stats dl > div, .full-stats > div, .appearances dl > div { min-width: 0; }
 dt { color: var(--card-muted); font-size: .65rem; font-weight: 700; line-height: 1.2; }
 dd { margin: .14rem 0 0; color: var(--card-ink); font-size: 1rem; font-weight: 850; line-height: 1.15; overflow-wrap: anywhere; }
 .comparison-stats p { margin: .45rem 0 0; color: var(--card-muted); font-size: .72rem; line-height: 1.35; }
 .back { display: grid; gap: .95rem; }
 .back > section:first-child { padding-top: 0; border-top: 0; }
 .full-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .65rem .45rem; margin: .7rem 0 0; }
 .full-stats dd { font-size: .88rem; }
 .appearances dl { display: flex; flex-wrap: wrap; gap: .5rem 1rem; margin: .6rem 0; }
 .back p, .back li { font-size: .78rem; line-height: 1.5; }
 .back p { margin: .5rem 0 0; }
 .back ul { margin: .55rem 0 0; padding-left: 1.15rem; }
 .back li + li { margin-top: .25rem; }
 .war-note { font-weight: 750; }
 .model-notes > a, .source-links a { display: inline-flex; align-items: center; min-height: 2.75rem; color: var(--card-ink); font-size: .78rem; font-weight: 700; }
 .source-links { display: flex; flex-wrap: wrap; gap: 0 1rem; margin-top: .35rem; }
 .compact { max-width: none; box-shadow: none; }
 .compact .season-row { padding: .5rem .6rem .35rem; }
 .compact .identity-band { gap: .5rem; padding: .4rem .6rem .55rem; }
 .compact .player-name { font-size: 1rem; letter-spacing: -.015em; }
 .compact .historical-team { font-size: .7rem; }
 .compact .team-mark-wrap > span { display: none; }
 .compact .qualification { padding: .5rem .6rem; }
 .compact .card-actions { padding: .5rem .6rem; }
 .compact .card-face { padding: .6rem; }
 .compact .front { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .7rem; align-items: start; }
 .compact .front .photo-stage { width: 3rem; }
 .compact .front .comparison-stats { margin-top: 0; }
 .compact .comparison-stats dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
 .compact .comparison-stats dl > div:nth-child(n + 3) { display: none; }
 .compact .comparison-stats section { padding-top: .5rem; }

 .player-card[data-era='1950'] { border-color: color-mix(in oklch, var(--club-color) 32%, var(--card-rule)); }
 .player-card[data-era='1950'] .player-name { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; letter-spacing: -.015em; }
 .player-card[data-era='1950'] .identity-band { margin-inline: .42rem; border: 1px solid color-mix(in oklch, var(--club-color) 38%, var(--card-rule)); }

 .player-card[data-era='1960'] { box-shadow: inset 0 0 0 .25rem var(--card-stock), inset 0 0 0 .4rem color-mix(in oklch, var(--club-color) 68%, var(--card-rule)), 0 .7rem 1.5rem oklch(8% .01 255 / .24); }
 .player-card[data-era='1960'] .team-mark-wrap { width: 4.6rem; min-height: 4.6rem; align-content: center; padding: .25rem; background: color-mix(in oklch, var(--club-color) 18%, var(--card-stock-raised)); border: 2px solid color-mix(in oklch, var(--club-color) 60%, var(--card-rule)); border-radius: 50%; overflow: hidden; }

 .player-card[data-era='1970']::before, .player-card[data-era='1970']::after { content: ''; position: absolute; z-index: 0; width: 4.5rem; height: 4.5rem; background: color-mix(in oklch, var(--club-color) 65%, oklch(58% .14 55)); clip-path: polygon(0 0, 100% 0, 0 100%); }
 .player-card[data-era='1970']::before { inset: 0 auto auto 0; }
 .player-card[data-era='1970']::after { inset: auto 0 0 auto; transform: rotate(180deg); }
 .player-card[data-era='1970'] .identity-band { background: var(--card-stock-raised); }

 .player-card[data-era='1980'] .season-row, .player-card[data-era='1980'] .identity-band { background: color-mix(in oklch, var(--club-color) 24%, var(--card-stock-raised)); }
 .player-card[data-era='1980'] .identity-band { border-block: .45rem solid color-mix(in oklch, var(--club-color) 72%, var(--card-ink)); }

 .player-card[data-era='1990'] .team-copy { padding: .55rem .75rem; background: oklch(30% .075 255); clip-path: polygon(0 0, 94% 0, 100% 50%, 94% 100%, 0 100%, 4% 50%); }
 .player-card[data-era='1990'] .team-copy .player-name { color: oklch(96% .008 240); }
 .player-card[data-era='1990'] .team-copy .historical-team { color: oklch(82% .02 235); }

 .player-card[data-era='2000']::before, .player-card[data-era='2000']::after { content: ''; position: absolute; z-index: 0; pointer-events: none; }
 .player-card[data-era='2000']::before { inset: .4rem; border: 1px solid color-mix(in oklch, var(--club-color) 48%, var(--card-rule)); clip-path: polygon(0 0, 35% 0, 42% 1.2rem, 100% 1.2rem, 100% 100%, 65% 100%, 58% calc(100% - 1.2rem), 0 calc(100% - 1.2rem)); }
 .player-card[data-era='2000']::after { inset: 0 0 auto auto; width: 5.5rem; height: 1.1rem; background: color-mix(in oklch, var(--club-color) 32%, oklch(55% .025 250)); clip-path: polygon(18% 0, 100% 0, 100% 100%, 0 100%); }

 .player-card[data-era='2010'] .identity-band { margin: .45rem .65rem 0; padding: .62rem; background: var(--card-stock-raised); border: 1px solid var(--card-rule); }
 .player-card[data-era='2010']:not(.compact) .photo-stage { margin-inline: -.85rem; }
 .player-card[data-era='2010']:not(.compact) .photo-stage :global(.photo-date) { padding-inline: .85rem; }

 .player-card[data-era='2020'] { --card-stock: oklch(25% .018 255); --card-stock-raised: oklch(32% .02 255); --card-ink: oklch(96% .008 245); --card-muted: oklch(78% .018 245); --card-rule: oklch(45% .025 250); }
 .player-card[data-era='2020']::before { content: ''; position: absolute; z-index: 0; inset: 0 0 auto auto; width: 7rem; height: 2.7rem; background: color-mix(in oklch, var(--club-color) 38%, var(--card-stock-raised)); clip-path: polygon(35% 0, 100% 0, 100% 100%, 0 100%); }
 .player-card[data-era='2020'] .identity-band { border-block: 1px solid color-mix(in oklch, var(--club-color) 55%, var(--card-rule)); }

 @media (max-width: 22rem) {
  .card-actions { grid-template-columns: 1fr; }
  .full-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .compact .front { grid-template-columns: 1fr; }
 }
</style>
