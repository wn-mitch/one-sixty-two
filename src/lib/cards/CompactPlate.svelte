<script lang="ts">
	import type { CardViewModel } from './view-model.ts';

	let { s }: { s: CardViewModel } = $props();
</script>

{#snippet printedName()}
	<span class="name" data-fit data-max="18" data-min="18" data-wrap-min="8" data-lines="2">{s.family}</span>
{/snippet}

<div class="compact-plate" data-compact-era={s.era} aria-hidden="true">
	<div class="fade"></div>

	{#if s.era === '1950s'}
		<div class="plate plate-1950s" style={`--ground:${s.k.stock};--ink:${s.k.fieldOnStock};--team:${s.k.field};--on-team:${s.k.onField}`}>
			<div class="nameplate">{@render printedName()}</div>
			<div class="meta"><span>{s.pos}</span><span>{s.st2.v}</span></div>
		</div>
	{:else if s.era === '1960s'}
		<div class="plate plate-1960s" style={`--ground:${s.k.field};--ink:${s.k.onField}`}>
			{@render printedName()}
			<div class="meta"><span>{s.pos}</span><span>{s.st2.v}</span></div>
		</div>
	{:else if s.era === '1970s'}
		<div class="plate plate-1970s" style={`--ground:${s.k.field};--ink:${s.k.onField}`}>
			{@render printedName()}
			<div class="meta"><span>{s.pos}</span><span>{s.st2.v}</span></div>
		</div>
	{:else if s.era === '1980s'}
		<div class="plate plate-1980s" style={`--ground:${s.k.stock};--ink:${s.k.fieldOnStock};--team:${s.k.field};--on-team:${s.k.onField};--stripe:${s.k.stripe}`}>
			{@render printedName()}
			<div class="meta"><span>{s.pos}</span><span>{s.st2.v}</span></div>
		</div>
	{:else if s.era === '1990s'}
		<div class="plate plate-1990s" style={`--ground:${s.k.field};--ink:${s.k.onField};--edge:${s.k.stock}`}>
			{@render printedName()}
			<div class="meta"><span>{s.pos}</span><span>{s.st2.v}</span></div>
		</div>
	{:else if s.era === '2000s'}
		<div class="plate plate-2000s" style={`--ground:${s.k.stock};--ink:${s.k.fieldOnStock};--team:${s.k.field}`}>
			{@render printedName()}
			<div class="meta"><span>{s.pos}</span><span>{s.st2.v}</span></div>
		</div>
	{:else if s.era === '2010s'}
		<div class="plate plate-2010s" style={`--ground:${s.k.field};--ink:${s.k.onField};--dark:${s.k.dark};--on-dark:${s.k.paper};--tint:${s.k.tintOnDark}`}>
			{@render printedName()}
			<div class="meta dark-strip"><span>{s.pos}</span><span>{s.st2.v}</span></div>
		</div>
	{:else}
		<div class="plate plate-2020s" style={`--ground:${s.k.dark};--ink:${s.k.paper};--tint:${s.k.tintOnDark}`}>
			{@render printedName()}
			<div class="meta"><span>{s.pos}</span><span>{s.st2.v}</span></div>
		</div>
	{/if}
</div>

<style>
	.compact-plate {
		position: absolute;
		inset: 0;
		/* Finish highlights extend to 10px; keep the readable plate above them. */
		transform: translateZ(11px);
		border-radius: 1.8cqw;
		font-family: 'Barlow Condensed', sans-serif;
		pointer-events: none;
	}
	.fade {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 72cqw;
		border-radius: 0 0 1.8cqw 1.8cqw;
		background: linear-gradient(to top, oklch(13% .01 255) 45%, oklch(13% .01 255 / .82) 70%, oklch(13% .01 255 / 0));
	}
	.plate {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		box-sizing: border-box;
		color: var(--ink);
		background: var(--ground);
	}
	.name {
		display: block;
		min-width: 0;
		font-size: max(18cqw, 12px);
		font-weight: 800;
		line-height: .88;
		text-align: inherit;
		text-transform: uppercase;
		text-wrap: balance;
		overflow-wrap: anywhere;
		hyphens: auto;
	}
	.meta {
		font-size: max(16cqw, 11px);
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
	.meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 3cqw;
	}
	.meta > span:last-child { margin-left: auto; text-align: right; }
	.plate-1950s {
		padding: 3cqw 4cqw 4cqw;
		border-radius: 0 0 1.8cqw 1.8cqw;
		box-shadow: 0 -.7cqw 0 var(--ink);
	}
	.nameplate {
		padding: 2.4cqw 4cqw 2.6cqw;
		color: var(--on-team);
		background: var(--team);
		clip-path: polygon(3cqw 0, calc(100% - 3cqw) 0, 100% 3cqw, 100% calc(100% - 3cqw), calc(100% - 3cqw) 100%, 3cqw 100%, 0 calc(100% - 3cqw), 0 3cqw);
		text-align: center;
	}
	.plate-1950s .meta { margin-top: 2cqw; padding-inline: 2cqw; }
	.plate-1960s {
		display: grid;
		gap: 2cqw;
		padding: 4cqw 6cqw 5cqw;
		border-radius: 0 0 1.8cqw 1.8cqw;
	}
	.plate-1970s {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 2cqw;
		padding: 3.5cqw 5cqw 4.5cqw;
		border-radius: 0 0 1.8cqw 1.8cqw;
	}
	.plate-1980s {
		display: grid;
		gap: 2cqw;
		padding: 3.5cqw 5cqw 4.5cqw;
		border-top: 1cqw solid var(--ink);
		border-radius: 0 0 1.8cqw 1.8cqw;
		background: repeating-linear-gradient(90deg, var(--stripe) 0 .5cqw, transparent .5cqw 4cqw), var(--ground);
	}
	.plate-1980s > .name {
		padding: 1.2cqw 2cqw;
		background: var(--ground);
	}
	.plate-1980s .meta > span:last-child {
		padding: .8cqw 1.6cqw;
		background: var(--ground);
	}
	.plate-1990s {
		display: grid;
		gap: 2cqw;
		padding: 3.5cqw 5cqw 4.5cqw;
		border-top: 1.4cqw solid var(--edge);
		border-radius: 0 0 1.8cqw 1.8cqw;
	}
	.plate-1990s .name { font-style: italic; font-weight: 900; }
	.plate-2000s {
		left: 0;
		display: grid;
		gap: 1.6cqw;
		padding: 3cqw 4cqw 4.5cqw;
		border-top: .9cqw solid var(--team);
		border-radius: 0 0 1.8cqw;
	}
	.plate-2010s {
		border-radius: 0 0 1.8cqw 1.8cqw;
	}
	.plate-2010s > .name { padding: 3cqw 5cqw 2.6cqw; }
	.dark-strip { padding: 2.2cqw 5cqw 3.4cqw; border-radius: 0 0 1.8cqw 1.8cqw; color: var(--on-dark); background: var(--dark); }
	.dark-strip span:first-child { color: var(--tint); }
	.plate-2020s {
		display: grid;
		gap: 2cqw;
		padding: 3.5cqw 5cqw 4.5cqw;
		border-radius: 0 0 0 1.8cqw;
		clip-path: polygon(0 0, 100% 0, 100% calc(100% - 8cqw), calc(100% - 11cqw) 100%, 0 100%);
	}
	.plate-2020s .meta { padding-right: 7cqw; }
	.plate-2020s .meta span:first-child { color: var(--tint); }
</style>
