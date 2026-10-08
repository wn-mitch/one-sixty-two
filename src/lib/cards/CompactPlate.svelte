<script lang="ts">
	import type { CardViewModel } from './view-model.ts';

	let { s }: { s: CardViewModel } = $props();
</script>

<div class="compact-plate" data-compact-era={s.era} aria-hidden="true">
	<div class="fade"></div>

	{#if s.era === '1950s'}
		<div class="plate plate-1950s" style={`--ground:${s.k.stock};--ink:${s.k.fieldOnStock};--team:${s.k.field};--on-team:${s.k.onField}`}>
			<div class="nameplate"><span class="name">{s.family}</span></div>
			<div class="meta"><span>{s.pos}</span><span>{s.st2.v}</span></div>
		</div>
	{:else if s.era === '1960s'}
		<div class="plate plate-1960s" style={`--ground:${s.k.field};--ink:${s.k.onField}`}>
			<span class="name">{s.family}</span>
			<div class="meta"><span class="position-pill">{s.pos}</span><span>{s.st2.v}</span></div>
		</div>
	{:else if s.era === '1970s'}
		<div class="plate plate-1970s" style={`--ground:${s.k.field};--ink:${s.k.onField};--stock:${s.k.stock};--on-stock:${s.k.fieldOnStock}`}>
			<span class="roundel">{s.pos}</span>
			<div class="plate-copy"><span class="name">{s.family}</span><span class="stat">{s.st2.v}</span></div>
		</div>
	{:else if s.era === '1980s'}
		<div class="plate plate-1980s" style={`--ground:${s.k.stock};--ink:${s.k.fieldOnStock};--team:${s.k.field};--on-team:${s.k.onField};--stripe:${s.k.stripe}`}>
			<span class="name">{s.family}</span>
			<div class="meta"><span class="position-tag">{s.pos}</span><span>{s.st2.v}</span></div>
		</div>
	{:else if s.era === '1990s'}
		<div class="plate plate-1990s" style={`--ground:${s.k.field};--ink:${s.k.onField};--edge:${s.k.stock}`}>
			<span class="name">{s.family}</span>
			<div class="meta"><span>{s.pos}</span><span>{s.st2.v}</span></div>
		</div>
	{:else if s.era === '2000s'}
		<div class="plate-2000s" style={`--ground:${s.k.stock};--ink:${s.k.fieldOnStock};--team:${s.k.field};--on-team:${s.k.onField}`}>
			<div class="position-rail"><span>{s.pos}</span></div>
			<div class="plate plate-copy-2000s"><span class="name">{s.family}</span><span class="stat">{s.st2.v}</span></div>
		</div>
	{:else if s.era === '2010s'}
		<div class="plate plate-2010s" style={`--ground:${s.k.field};--ink:${s.k.onField};--dark:${s.k.dark};--on-dark:${s.k.paper};--tint:${s.k.tintOnDark}`}>
			<span class="name">{s.family}</span>
			<div class="meta dark-strip"><span>{s.pos}</span><span>{s.st2.v}</span></div>
		</div>
	{:else}
		<div class="plate plate-2020s" style={`--ground:${s.k.dark};--ink:${s.k.paper};--tint:${s.k.tintOnDark}`}>
			<span class="name">{s.family}</span>
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
	.meta,
	.stat,
	.roundel,
	.position-rail {
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
	.position-pill {
		padding: .6cqw 3.2cqw;
		border-radius: 99cqw;
		color: var(--ground);
		background: var(--ink);
	}
	.plate-1970s {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 3cqw;
		padding: 3.5cqw 5cqw 4.5cqw;
		border-radius: 0 0 1.8cqw 1.8cqw;
	}
	.roundel {
		display: grid;
		place-items: center;
		width: 27cqw;
		height: 27cqw;
		border-radius: 50%;
		color: var(--on-stock);
		background: var(--stock);
		box-shadow: 0 0 0 1.1cqw var(--ground), 0 0 0 1.8cqw var(--stock);
	}
	.plate-copy { display: grid; gap: 1.2cqw; min-width: 0; }
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
	.position-tag { padding: .8cqw 2.6cqw; color: var(--on-team); background: var(--team); }
	.plate-1990s {
		display: grid;
		gap: 2cqw;
		padding: 3.5cqw 5cqw 4.5cqw;
		border-top: 1.4cqw solid var(--edge);
		border-radius: 0 0 1.8cqw 1.8cqw;
	}
	.plate-1990s .name { font-style: italic; font-weight: 900; }
	.plate-2000s {
		position: absolute;
		inset: 0;
		color: var(--ink);
	}
	.position-rail {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		box-sizing: border-box;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		width: 22cqw;
		padding: 0 2cqw 4.5cqw;
		border-radius: 1.8cqw 0 0 1.8cqw;
		color: var(--on-team);
		background: var(--team);
	}
	.position-rail span {
		display: block;
		white-space: nowrap;
		writing-mode: vertical-rl;
		transform: rotate(180deg);
	}
	.plate-copy-2000s {
		left: 22cqw;
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
	.plate-2020s .meta { justify-content: flex-start; gap: 4cqw; }
	.plate-2020s .meta span:first-child { color: var(--tint); }
</style>
