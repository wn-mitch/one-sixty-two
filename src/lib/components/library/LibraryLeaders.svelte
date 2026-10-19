<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LeaderGroups } from '../../game/library-stats.ts';
	import type { CardViewModel } from '../../cards/view-model.ts';
	import Card from '../../cards/Card.svelte';

	/** Ranked cards across every saved club; choosing a card opens its saved team. */
	let { groups, cards, teamCard, onPick }: {
		groups: LeaderGroups;
		cards: ReadonlyMap<string, ReadonlyMap<string, CardViewModel>>;
		teamCard: Snippet<[entryKey: string]>;
		onPick: (entryKey: string) => void;
	} = $props();

	const sections = $derived([
		{ id: 'teams', title: 'Clubs', boards: groups.teams },
		{ id: 'value', title: 'Most valuable', boards: groups.value },
		{ id: 'batting', title: 'Batting', boards: groups.batting },
		{ id: 'pitching', title: 'Pitching', boards: groups.pitching }
	]);
</script>

<section class="leaders" aria-labelledby="leaders-heading">
	<h2 id="leaders-heading">All-time leaders</h2>
	{#each sections as section (section.id)}
		<section class="group" aria-labelledby={`leaders-${section.id}`}>
			<h3 id={`leaders-${section.id}`}>{section.title}</h3>
			{#each section.boards as board (board.id)}
				<section class="board" aria-labelledby={`board-${board.id}`}>
					<h4 id={`board-${board.id}`}>{board.title}</h4>
					{#if board.leaders.length}
						<ol aria-label={`${board.title} leaders`}>
							{#each board.leaders as leader, index (`${leader.entryKey}:${leader.seasonId ?? ''}`)}
								<li>
									{#if leader.seasonId}
										{@const view = cards.get(leader.entryKey)?.get(leader.seasonId)}
										<button type="button" class="player-card" aria-label={`${index + 1}. ${leader.player} · ${leader.display} ${board.title} · ${leader.team}`} onclick={() => onPick(leader.entryKey)}>
											{#if view}
												<Card s={view} face="front" idle={false} onDetails={() => onPick(leader.entryKey)} />
											{:else}
												<span class="unavailable">{leader.player}</span>
											{/if}
										</button>
									{:else}
										{@render teamCard(leader.entryKey)}
									{/if}
									<div class="standing"><strong class="value">{leader.display}</strong></div>
									{#if leader.player}<span class="team" title={leader.team}>{leader.team}</span>{/if}
								</li>
							{/each}
						</ol>
					{:else}
						<p class="empty">No qualifying seasons yet.</p>
					{/if}
					{#if board.note}<p class="note">{board.note}</p>{/if}
				</section>
			{/each}
		</section>
	{/each}
</section>

<style>
	.leaders { display: grid; gap: var(--space-5); container-type: inline-size; }
	h2 { margin: 0; font-size: var(--text-xl); }
	.group { display: grid; gap: var(--space-4); }
	h3 { margin: 0; padding-bottom: var(--space-1); border-bottom: 1px solid var(--border); font-size: var(--text-sm); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
	.board { display: grid; gap: var(--space-2); min-width: 0; }
	h4 { margin: 0; font: 800 var(--text-lg) / 1.2 'Barlow Condensed', sans-serif; }
	.note, .empty { margin: 0; color: var(--muted); font-size: var(--text-xs); line-height: 1.4; }
	ol { display: grid; grid-template-columns: repeat(6, minmax(2.75rem, 1fr)); align-items: start; gap: var(--space-1); overflow-x: auto; margin: -3px; padding: 3px; list-style: none; }
	li { min-width: 0; }
	.player-card { display: block; width: 100%; padding: 0; border: 0; border-radius: var(--radius); background: transparent; color: inherit; text-align: left; }
	.player-card, li :global(.tile) { cursor: pointer; outline: 1px solid var(--border); outline-offset: 1px; }
	.player-card:hover:not(:disabled), li :global(.tile:hover) { background: transparent; outline: 2px solid var(--accent); }
	.player-card:active:not(:disabled) { transform: none; }
	.player-card:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
	.unavailable { display: grid; place-items: center; aspect-ratio: 5 / 7; padding: var(--space-2); box-sizing: border-box; border: 1px solid var(--border); background: var(--surface-raised); font-size: var(--text-sm); }
	.standing { display: flex; justify-content: center; padding-top: var(--space-1); font-variant-numeric: tabular-nums; }
	.value { font-size: var(--text-xs); font-weight: 800; }
	/* Two lines fit the record and the park under a narrow card, so captions stay distinguishable. */
	.team { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; color: var(--muted); font-size: var(--text-xs); line-height: 1.3; text-align: center; overflow-wrap: anywhere; }
</style>
