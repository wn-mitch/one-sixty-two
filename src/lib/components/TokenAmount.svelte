<script lang="ts">
	let { amount }: { amount: number | null } = $props();
</script>

<span class="token-amount">
	<svg aria-hidden="true" viewBox="0 0 20 20" focusable="false">
		<circle cx="10" cy="10" r="8.25"></circle>
		<circle cx="10" cy="10" r="5.25"></circle>
		<path d="m10 6.5.95 2.55 2.55.95-2.55.95L10 13.5l-.95-2.55L6.5 10l2.55-.95L10 6.5Z"></path>
	</svg>
	<span class="count">{amount ?? '…'}</span>
	<span class="sr-only">unlock {amount === 1 ? 'token' : 'tokens'}</span>
</span>

<style>
	.token-amount {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: .35em;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
	svg { width: 1.15em; height: 1.15em; flex: none; overflow: visible; }
	circle { fill: none; stroke: currentColor; stroke-width: 1.25; }
	path { fill: currentColor; }
	.count { min-width: 1ch; text-align: center; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
</style>
