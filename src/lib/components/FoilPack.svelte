<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SILVER } from '../cards/finish.ts';
	import { STOCK, roles } from '../cards/tokens.ts';
	import { appSettings } from '../game/settings.svelte.ts';
	import { EASE_IN_OUT, EASE_OUT, MOTION } from '../motion-timing.ts';
	import type { Roll } from '../game/types.ts';
	import TeamLogo from './TeamLogo.svelte';

	let { roll, franchiseName, years, teamColor, pickNumber, pickCount, disabled = false, flyTarget, onOpen, onArrive, onDealt }: {
		/** The committed roll; it arrives after `onOpen` commits it. */
		roll: Roll | null;
		franchiseName?: string;
		years?: { first: number; last: number } | null;
		teamColor?: string;
		pickNumber: number;
		pickCount: number;
		disabled?: boolean;
		/** Where the dealt card lands: the header's roll identity. */
		flyTarget: () => HTMLElement | null;
		/** Commits the roll. */
		onOpen: () => void;
		/** The card is reaching the rail; the rail may show the roll. Fires before `onDealt`. */
		onArrive: () => void;
		/** The dealt card has landed, or dealing was abandoned. */
		onDealt: () => void;
	} = $props();

	/** Sealed → opening (tear and deal) → dealt (waits for the player to take it) → taking (flies to the rail). */
	type Stage = 'sealed' | 'opening' | 'dealt' | 'taking';
	let stage = $state<Stage>('sealed');
	let packGone = $state(false);
	let pack = $state<HTMLElement>();
	let seal = $state<HTMLElement>();
	let card = $state<HTMLButtonElement>();
	let flipper = $state<HTMLElement>();
	const palette = $derived(teamColor ? roles({ primary: teamColor, secondary: STOCK }) : null);
	const cardStyle = $derived(palette ? `--deal-ground: ${palette.field}; --deal-ink: ${palette.onField};` : undefined);
	const running = new Set<Animation>();

	function play(element: HTMLElement | undefined, keyframes: Keyframe[], options: KeyframeAnimationOptions): Promise<void> {
		if (!element) return Promise.resolve();
		const animation = element.animate(keyframes, { fill: 'forwards', easing: EASE_OUT, ...options });
		running.add(animation);
		return animation.finished.then(() => { running.delete(animation); }, () => { running.delete(animation); });
	}

	const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

	async function open(): Promise<void> {
		if (stage !== 'sealed' || disabled) return;
		stage = 'opening';
		onOpen();
		await tick();
		if (!roll) {
			// The roll could not be committed; the session reports the error.
			stage = 'sealed';
			onDealt();
			return;
		}
		if (appSettings.effectiveEnabled) {
			await Promise.all([
				play(seal, [{ transform: 'none', opacity: 1 }, { transform: 'translate(18%, -140%) rotate(9deg)', opacity: 0 }], { duration: MOTION.packTear }),
				play(pack, [{ transform: 'none' }, { transform: 'translateY(.35rem) rotate(-1deg)' }], { duration: MOTION.packTear })
			]);
			await play(card, [{ transform: 'translateY(0)' }, { transform: 'translateY(-62%)' }], { duration: MOTION.cardRise });
			stage = 'dealt';
			// The pack pulls away underneath while the card turns face up.
			await Promise.all([
				play(pack, [{ transform: 'translateY(.35rem) rotate(-1deg)', opacity: 1 }, { transform: 'translateY(115%) rotate(-4deg)', opacity: 0 }], { duration: MOTION.packDrop, easing: EASE_IN_OUT }),
				play(card, [{ transform: 'translateY(-62%)' }, { transform: 'translateY(0) scale(1.06)' }], { duration: MOTION.dealSettle }),
				play(flipper, [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], { duration: MOTION.deal, delay: 60 })
			]);
		} else {
			stage = 'dealt';
		}
		packGone = true;
		await tick();
		card?.focus({ preventScroll: true });
	}

	/** Slides the dealt card into the rail; the rail then grows the franchise name and era. */
	async function take(): Promise<void> {
		if (stage !== 'dealt') return;
		stage = 'taking';
		if (appSettings.effectiveEnabled) await fly();
		onArrive();
		onDealt();
	}

	/** Moves the dealt card onto the header roll identity and fades it there. */
	async function fly(): Promise<void> {
		const target = flyTarget();
		if (!card || !target) return;
		const from = card.getBoundingClientRect();
		const to = target.getBoundingClientRect();
		if (!from.width || !to.width) return;
		const dx = to.left + to.width / 2 - (from.left + from.width / 2);
		const dy = to.top + to.height / 2 - (from.top + from.height / 2);
		const scale = to.height / from.height;
		const start = appSettings.effectiveEnabled ? 'translateY(0) scale(1.06)' : 'none';
		// The rail starts growing the franchise and era while the card is still arriving, so the card reads as turning into the name.
		const arrive = setTimeout(onArrive, MOTION.deal * MOTION.dealHandoff);
		const slide = play(card, [
			{ transform: start, opacity: 1 },
			{ opacity: 1, offset: .75 },
			{ transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 }
		], { duration: MOTION.deal });
		// Hand off to the candidate deal once the card has landed rather than after its last faint frames.
		await Promise.race([slide, wait(MOTION.deal * MOTION.dealOutLead)]);
		clearTimeout(arrive);
	}

	onMount(() => {
		const release = appSettings.retain();
		return () => {
			for (const animation of running) animation.cancel();
			release();
		};
	});
</script>

<div class="foil-pack" class:opening={stage !== 'sealed'} class:dealt={stage === 'dealt' || stage === 'taking'} class:pack-gone={packGone}>
	<div class="stage">
		<button
			type="button"
			class="dealt-card"
			bind:this={card}
			style={cardStyle}
			aria-hidden={stage === 'dealt' ? undefined : 'true'}
			aria-label={roll ? `Take ${franchiseName ?? roll.franchiseId}${years ? `, ${years.first}–${years.last}` : ''}` : undefined}
			tabindex={stage === 'dealt' ? 0 : -1}
			disabled={stage !== 'dealt'}
			onclick={take}
		>
			<div class="flipper" bind:this={flipper}>
				<div class="face back"><span class="back-mark"></span></div>
				<div class="face front">
					{#if roll}
						<TeamLogo franchiseId={roll.franchiseId} label={franchiseName ?? roll.franchiseId} size="large" />
						<strong>{franchiseName ?? roll.franchiseId}</strong>
						{#if years}<span class="years">{years.first}–{years.last}</span>{/if}
					{/if}
				</div>
			</div>
		</button>
		<button id="roll-next" type="button" class="pack" bind:this={pack} aria-label="Roll next franchise" disabled={disabled || stage !== 'sealed'} onclick={open} style:--foil={SILVER}>
			<span class="seal" bind:this={seal} aria-hidden="true"></span>
			<span class="pack-face" aria-hidden="true">
				<span class="wordmark"><span class="mark"></span>162-0</span>
				<span class="pack-title">Franchise pack</span>
				<span class="pack-count">Pick {pickNumber} of {pickCount}</span>
			</span>
			<span class="seal bottom" aria-hidden="true"></span>
		</button>
	</div>
	<p class="caption" aria-hidden="true">{stage === 'sealed' ? 'Roll next franchise' : stage === 'dealt' ? 'Take the card' : 'Dealing…'}</p>
</div>

<style>
	.foil-pack { display: grid; justify-items: center; gap: var(--space-3); padding-block: var(--space-8); }
	.stage { position: relative; display: grid; width: min(11.5rem, 52vw); aspect-ratio: 5 / 7.4; perspective: 900px; }
	.pack, .dealt-card { grid-area: 1 / 1; }
	.pack {
		--mx: 30%;
		--my: 50%;
		position: relative;
		z-index: 2;
		display: grid;
		grid-template-rows: 1.1rem 1fr 1.1rem;
		width: 100%;
		height: 100%;
		min-height: 44px;
		padding: 0;
		border: 0;
		border-radius: .35rem;
		color: var(--background);
		background: var(--foil);
		box-shadow: 0 1rem 2rem oklch(8% .01 255 / .45), inset 0 0 0 1px oklch(100% 0 0 / .35);
		overflow: hidden;
		cursor: pointer;
	}
	.pack::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(105deg, transparent 30%, oklch(100% 0 0 / .55) 45%, transparent 60%) 0 0 / 250% 100%;
		mix-blend-mode: soft-light;
		animation: glint 3.2s ease-in-out infinite;
		pointer-events: none;
	}
	.pack:hover:not(:disabled) { background: var(--foil); filter: brightness(1.06); }
	.pack:active:not(:disabled) { transform: translateY(1px); }
	.pack:disabled { cursor: default; opacity: 1; }
	.pack-gone .pack { visibility: hidden; }
	.pack:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
	.seal {
		background: repeating-linear-gradient(90deg, oklch(70% .01 255) 0 4px, oklch(88% .01 255) 4px 8px);
		mask: radial-gradient(circle at 50% 100%, transparent 3px, #000 3.5px) 0 0 / 8px 100% repeat-x;
	}
	.seal.bottom { transform: scaleY(-1); }
	.pack-face {
		display: grid;
		align-content: center;
		justify-items: center;
		gap: var(--space-2);
		margin-inline: .6rem;
		padding: var(--space-3) var(--space-2);
		color: var(--text);
		background: oklch(16% .012 255 / .92);
		border-block: 3px solid oklch(100% 0 0 / .6);
	}
	.wordmark { display: inline-flex; align-items: center; gap: .45rem; font-size: 1.35rem; font-weight: 850; letter-spacing: -.04em; }
	.mark { width: .55rem; height: .55rem; border: 2px solid currentColor; transform: rotate(45deg); }
	.pack-title { font: italic 900 1.15rem / 1 'Barlow Condensed', sans-serif; letter-spacing: .02em; text-transform: uppercase; color: var(--accent); }
	.pack-count { color: var(--muted); font-size: var(--text-xs); font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
	.dealt-card {
		position: relative;
		z-index: 1;
		align-self: center;
		justify-self: center;
		width: 86%;
		aspect-ratio: 5 / 7;
		visibility: hidden;
	}
	.opening .dealt-card { visibility: visible; }
	.dealt .dealt-card { z-index: 3; }
	button.dealt-card { padding: 0; border: 0; border-radius: .3rem; color: inherit; background: none; font: inherit; }
	button.dealt-card:not(:disabled) { cursor: pointer; }
	button.dealt-card:hover:not(:disabled) { background: none; }
	button.dealt-card:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
	.flipper { position: absolute; inset: 0; transform: rotateY(180deg); transform-style: preserve-3d; }
	.dealt .flipper { transform: none; }
	.face {
		position: absolute;
		inset: 0;
		display: grid;
		align-content: center;
		justify-items: center;
		gap: var(--space-2);
		padding: var(--space-3);
		border-radius: .3rem;
		backface-visibility: hidden;
		box-shadow: 0 .75rem 1.5rem oklch(8% .01 255 / .5);
	}
	.back {
		transform: rotateY(180deg);
		background: repeating-linear-gradient(45deg, oklch(30% .02 255) 0 6px, oklch(34% .02 255) 6px 12px);
		border: 4px solid var(--surface-raised);
	}
	.back-mark { width: 1.5rem; height: 1.5rem; border: 3px solid var(--muted); transform: rotate(45deg); }
	.front {
		color: var(--deal-ink, var(--text));
		background: var(--deal-ground, var(--surface-raised));
		border: 4px solid color-mix(in oklch, var(--deal-ink, var(--text)) 85%, transparent);
		text-align: center;
	}
	.front strong { font: italic 900 1.35rem / 1 'Barlow Condensed', sans-serif; text-transform: uppercase; overflow-wrap: anywhere; }
	.years { font: italic 800 1.1rem / 1 'Barlow Condensed', sans-serif; }
	.caption { margin: 0; color: var(--muted); font-size: var(--text-sm); font-weight: 650; letter-spacing: .02em; }
	@keyframes glint { 0%, 55% { background-position: 120% 0; } 100% { background-position: -120% 0; } }
	:global([data-motion='off']) .pack::after { animation: none; }
	@media (prefers-reduced-motion: reduce) { .pack::after { animation: none; } }
</style>
