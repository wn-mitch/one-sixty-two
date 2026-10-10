<script lang="ts">
	import type { LeaderGroups } from '../../game/library-stats.ts';

	/** All-time leaderboards across every saved club; choosing a row selects that club. */
	let { groups, onPick }: { groups: LeaderGroups; onPick: (entryKey: string) => void } = $props();

	const sections = $derived([
		{ id: 'teams', title: 'Clubs', boards: groups.teams },
		{ id: 'value', title: 'Most valuable', boards: groups.value },
		{ id: 'batting', title: 'Batting', boards: groups.batting },
		{ id: 'pitching', title: 'Pitching', boards: groups.pitching }
	]);
</script>

<section class="leaders" aria-labelledby="leaders-heading">
	<header>
		<p class="eyebrow">Across every saved club</p>
		<h2 id="leaders-heading">All-time leaders</h2>
	</header>
	{#each sections as section (section.id)}
		<section class="group" aria-labelledby={`leaders-${section.id}`}>
			<h3 id={`leaders-${section.id}`}>{section.title}</h3>
			<div class="boards">
				{#each section.boards as board (board.id)}
					<div class="board">
						<h4>{board.title}</h4>
						{#if board.note}<p class="note">{board.note}</p>{/if}
						{#if board.leaders.length}
							<ol>
								{#each board.leaders as leader, index (`${leader.entryKey}:${leader.seasonId ?? ''}`)}
									<li>
										<button type="button" class="row" onclick={() => onPick(leader.entryKey)}>
											<span class="rank">{index + 1}</span>
											<span class="who">
												<span class="name">{leader.player ?? leader.team}</span>
												{#if leader.player}<span class="team">{leader.team}</span>{/if}
											</span>
											<span class="value">{leader.display}</span>
										</button>
									</li>
								{/each}
							</ol>
						{:else}
							<p class="note">No qualifying seasons yet.</p>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/each}
</section>

<style>
	.leaders { display: grid; gap: var(--space-5); }
	header { display: grid; gap: var(--space-1); }
	.eyebrow { margin: 0; color: var(--muted); font-size: var(--text-xs); font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
	h2 { margin: 0; font-size: var(--text-xl); }
	.group { display: grid; gap: var(--space-2); }
	h3 { margin: 0; padding-bottom: var(--space-1); border-bottom: 1px solid var(--border); font-size: var(--text-sm); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
	.boards { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: var(--space-4); }
	.board { display: grid; gap: var(--space-1); align-content: start; min-width: 0; }
	h4 { margin: 0; font-size: var(--text-sm); }
	.note { margin: 0; color: var(--muted); font-size: var(--text-xs); }
	ol { display: grid; margin: 0; padding: 0; list-style: none; }
	.row {
		display: grid;
		grid-template-columns: 1.25rem minmax(0, 1fr) auto;
		gap: var(--space-2);
		align-items: center;
		width: 100%;
		min-height: 2.25rem;
		padding: .2rem var(--space-1);
		border: 0;
		border-radius: calc(var(--radius) - 2px);
		background: transparent;
		text-align: left;
		font-weight: inherit;
	}
	.row:hover:not(:disabled) { background: var(--surface-raised); }
	.row:active:not(:disabled) { transform: none; }
	.rank { color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
	.who { display: grid; min-width: 0; }
	.name { font-size: var(--text-sm); font-weight: 650; overflow-wrap: anywhere; }
	.team { color: var(--muted); font-size: var(--text-xs); overflow-wrap: anywhere; }
	.value { font-weight: 800; font-variant-numeric: tabular-nums; }
</style>
