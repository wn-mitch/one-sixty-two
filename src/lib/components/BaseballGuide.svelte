<script lang="ts">
	import { LINEUP_STAT_GLOSSARY, POSITION_GLOSSARY, STAT_GLOSSARY } from '#lib/game/glossary.ts';

	let {
		showTrigger = true,
		triggerLabel = 'Baseball guide',
		compact = false,
		showLineupStats = false
	}: {
		showTrigger?: boolean;
		triggerLabel?: string;
		compact?: boolean;
		showLineupStats?: boolean;
	} = $props();

	let dialog = $state<HTMLDialogElement>();
	let trigger = $state<HTMLButtonElement>();
	let returnFocus: HTMLElement | null = null;
	const uid = $props.id();
	const titleId = `${uid}-title`;

	const hitters = POSITION_GLOSSARY.filter(entry => entry.group === 'hitter');
	const pitchers = POSITION_GLOSSARY.filter(entry => entry.group === 'pitcher');

	export function open(returnTo?: HTMLElement): void {
		returnFocus = returnTo ?? null;
		dialog?.showModal();
	}

	function close(): void {
		dialog?.close();
	}

	function restoreFocus(): void {
		(returnFocus ?? trigger)?.focus({ preventScroll: true });
		returnFocus = null;
	}
</script>

{#if showTrigger}
	<button
		bind:this={trigger}
		type="button"
		class="guide-trigger"
		class:compact
		aria-haspopup="dialog"
		aria-label={triggerLabel}
		title={triggerLabel}
		onclick={() => open()}
	>
		<span class="guide-badge" aria-hidden="true">?</span>
		{#if !compact}<span>{triggerLabel}</span>{/if}
	</button>
{/if}

<dialog
	bind:this={dialog}
	class="guide-dialog"
	aria-labelledby={titleId}
	onclick={event => { if (event.target === dialog) close(); }}
	onclose={restoreFocus}
>
	<div class="guide-panel">
		<header class="guide-header">
			<div>
				<h2 id={titleId}>Baseball &amp; card guide</h2>
				<p class="subtitle">New to baseball? Here is everything you need to pick a great team.</p>
			</div>
			<button type="button" class="close-button" aria-label="Close baseball guide" onclick={close}>×</button>
		</header>

		<div class="guide-body">
			<section aria-labelledby={`${uid}-basics`}>
				<h3 id={`${uid}-basics`}>The 10-second rules</h3>
				<p>You open <strong>16 packs</strong> and pick <strong>1 player</strong> from each to fill a 16-player roster: <strong>9 hitters</strong> and <strong>7 pitchers</strong>. Then your team plays a 162-game season against real 2025 MLB clubs.</p>
				<p><strong>Quick tip:</strong> If you don't know the players, sort by <strong>WAR</strong> and look for the highest <strong>WAR/162</strong> number that fits an open spot.</p>
			</section>

			<section aria-labelledby={`${uid}-stats`}>
				<h3 id={`${uid}-stats`}>Reading the numbers on a card</h3>
				<ul class="stat-list">
					{#each STAT_GLOSSARY as stat (stat.code)}
						<li>
							<div class="stat-head">
								<strong>{stat.code}</strong>
								<span class="stat-name">{stat.name}</span>
								<span class="direction" class:lower={stat.direction === 'lower'}>
									{stat.direction === 'higher' ? 'Higher is better' : 'Lower is better'}
								</span>
							</div>
							<p>{stat.summary}</p>
						</li>
					{/each}
				</ul>
				{#if showLineupStats}
					<h4>Lineup stats</h4>
					<ul class="stat-list">
						{#each LINEUP_STAT_GLOSSARY as stat (stat.code)}
							<li>
								<div class="stat-head">
									<strong>{stat.code}</strong>
									<span class="stat-name">{stat.name}</span>
									<span class="direction">Higher is better</span>
								</div>
								<p>{stat.summary}</p>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section aria-labelledby={`${uid}-positions`}>
				<h3 id={`${uid}-positions`}>The 16 roster spots</h3>
				<div class="position-columns">
					<div>
						<h4>Hitters (9 spots)</h4>
						<dl>
							{#each hitters as pos (pos.code)}
								<div>
									<dt><strong>{pos.code}</strong> {pos.name}</dt>
									<dd>{pos.summary}</dd>
								</div>
							{/each}
						</dl>
					</div>
					<div>
						<h4>Pitchers (7 spots)</h4>
						<dl>
							{#each pitchers as pos (pos.code)}
								<div>
									<dt><strong>{pos.code}</strong> {pos.name}</dt>
									<dd>{pos.summary}</dd>
								</div>
							{/each}
						</dl>
					</div>
				</div>
			</section>
		</div>

		<footer class="guide-footer">
			<a class="button secondary" href="/how-to-play" onclick={close}>Full how-to-play guide</a>
			<button type="button" class="primary" onclick={close}>Back to game</button>
		</footer>
	</div>
</dialog>

<style>
	.guide-trigger {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 2.75rem;
		padding: var(--space-1) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		font-size: var(--text-sm);
		font-weight: 650;
		white-space: nowrap;
	}
	.guide-trigger.compact {
		justify-content: center;
		width: 2.75rem;
		min-width: 2.75rem;
		padding: 0;
		border-color: transparent;
	}
	.guide-trigger:hover { color: var(--text); background: var(--surface); border-color: var(--border); }
	.guide-badge {
		display: grid;
		place-items: center;
		width: 1.25rem;
		height: 1.25rem;
		border: 1px solid currentColor;
		border-radius: 50%;
		font-size: var(--text-xs);
		font-weight: 800;
		line-height: 1;
	}
	.guide-dialog {
		width: min(40rem, calc(100vw - 2rem));
		max-height: min(46rem, calc(100dvh - 2rem));
		margin: auto;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		color: var(--text);
		box-shadow: 0 1.5rem 4rem color-mix(in oklch, var(--background) 72%, transparent);
	}
	.guide-dialog::backdrop { background: color-mix(in oklch, var(--background) 76%, transparent); }
	.guide-panel { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; max-height: inherit; }
	.guide-header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-5) var(--space-6) var(--space-4);
		border-bottom: 1px solid var(--border);
	}
	.guide-header h2 { margin: 0; font-size: var(--text-xl); }
	.subtitle { margin: var(--space-1) 0 0; color: var(--muted); font-size: var(--text-sm); }
	.close-button { min-width: 2.75rem; padding-inline: 0; font-size: 1.5rem; line-height: 1; }
	.guide-body {
		display: grid;
		gap: var(--space-6);
		padding: var(--space-5) var(--space-6);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	section { display: grid; gap: var(--space-2); }
	h3 { margin: 0; font-size: var(--text-lg); }
	h4 { margin: var(--space-2) 0 var(--space-1); color: var(--muted); font-size: var(--text-xs); font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
	p { margin: 0; color: var(--muted); font-size: var(--text-sm); line-height: 1.55; }
	p strong { color: var(--text); }
	.stat-list { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
	.stat-list li { padding: var(--space-2) var(--space-3); border: 1px solid var(--border); border-radius: var(--radius); background: var(--background); }
	.stat-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-2); margin-bottom: var(--space-1); }
	.stat-head strong { font-size: var(--text-sm); }
	.stat-name { color: var(--muted); font-size: var(--text-xs); font-weight: 650; }
	.direction {
		margin-left: auto;
		padding: .1rem .45rem;
		border-radius: 999px;
		background: color-mix(in oklch, var(--success) 16%, transparent);
		color: var(--success);
		font-size: var(--text-xs);
		font-weight: 700;
	}
	.direction.lower {
		background: color-mix(in oklch, var(--focus) 16%, transparent);
		color: var(--focus);
	}
	.position-columns { display: grid; gap: var(--space-4); }
	dl { display: grid; gap: var(--space-2); margin: 0; }
	dl > div { display: grid; gap: 2px; }
	dt { font-size: var(--text-sm); font-weight: 650; }
	dt strong { display: inline-block; min-width: 2.25rem; color: var(--accent); font-variant-numeric: tabular-nums; }
	dd { margin: 0; color: var(--muted); font-size: var(--text-xs); line-height: 1.45; }
	.guide-footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: var(--space-4) var(--space-6);
		border-top: 1px solid var(--border);
		background: var(--surface-raised);
	}
	@media (min-width: 36rem) {
		.position-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
	@media (max-width: 28rem) {
		.guide-header, .guide-body, .guide-footer { padding-inline: var(--space-4); }
	}
</style>
