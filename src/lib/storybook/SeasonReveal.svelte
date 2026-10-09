<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { appSettings } from '#lib/game/settings.svelte.ts';
	import Results from '#lib/components/Results.svelte';
	import Progress from '#lib/components/Progress.svelte';
	import type { Draft, Manifest, Profile } from '#lib/game/types.ts';
	import type { WarRankings } from '#lib/rankings/types.ts';
	import type { ShareAction, ShareFormat, SharePublication } from '#lib/share/types.ts';
	import type { SeasonResult } from '#lib/sim/types.ts';
	import { createExamplePublication } from './season-fixtures.ts';

	const EXAMPLE_SHARE_IMAGE = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22%3E%3Crect width=%221%22 height=%221%22 fill=%22%23151a26%22/%3E%3C/svg%3E';
	const EXAMPLE_PUBLICATION = {
		replayId: 'example',
		replayUrl: 'https://example.invalid/r/example',
		modelDigest: 'example-only',
		imageUrl: EXAMPLE_SHARE_IMAGE,
		imageDigest: 'example'
	};

	let {
		result,
		draft,
		profiles,
		manifest,
		rankings,
		completed = 0,
		initialRevealed = 0,
		autoReveal = false,
		onNew,
		onSkipComputing
	}: {
		result: SeasonResult | null;
		draft: Draft;
		profiles: Profile[];
		manifest: Manifest;
		rankings: WarRankings;
		completed?: number;
		initialRevealed?: number;
		autoReveal?: boolean;
		onNew: () => void;
		onSkipComputing?: () => void;
	} = $props();

	let revealed = $state(untrack(() => initialRevealed));
	let publication = $state<SharePublication | null>(null);
	let shareStatus = $state('');
	let timer: ReturnType<typeof setInterval> | null = null;

	function clearTimer(): void {
		if (timer !== null) {
			clearInterval(timer);
			timer = null;
		}
	}

	function reducedMotion(): boolean {
		return !appSettings.effectiveEnabled;
	}

	export function replay(): void {
		clearTimer();
		publication = null;
		shareStatus = '';
		revealed = 0;
		if (!result) return;
		if (reducedMotion()) {
			revealed = result.games.length;
			return;
		}
		timer = setInterval(() => {
			revealed = Math.min(result.games.length, revealed + 1);
			if (revealed >= result.games.length) clearTimer();
		}, 35);
	}

	function skip(): void {
		if (result) {
			clearTimer();
			revealed = result.games.length;
			return;
		}
		onSkipComputing?.();
	}

	function share(action: ShareAction, _format: ShareFormat): void {
		if (action === 'copy-link' || action === 'challenge') {
			publication = createExamplePublication(result, EXAMPLE_PUBLICATION);
			shareStatus = 'Example link only. No upload performed.';
			return;
		}
		shareStatus = 'Example sharing is unavailable. No upload performed.';
	}

	$effect(() => {
		if (result && !appSettings.effectiveEnabled && timer !== null) {
			clearTimer();
			revealed = result.games.length;
		}
	});

	onMount(() => {
		if (autoReveal) replay();
	});
	onDestroy(clearTimer);
</script>

{#if result && revealed >= result.games.length}
	<Results
		{result}
		{draft}
		{profiles}
		{manifest}
		{rankings}
		rankingLoading={false}
		rankingError={false}
		onNew={onNew}
		onShare={share}
		{publication}
		sharing={false}
		shareStatus={shareStatus}
	/>
{:else}
	<Progress
		completed={completed}
		{revealed}
		{result}
		onskip={skip}
	/>
{/if}
