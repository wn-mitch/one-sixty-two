<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { GEMHOLO, SILVER } from '../cards/finish.ts';
	import { STOCK, roles } from '../cards/tokens.ts';
	import { appSettings } from '../game/settings.svelte.ts';
	import { EASE_IN_OUT, EASE_OUT, MOTION } from '../motion-timing.ts';
	import { isJackpot, type Roll } from '../game/types.ts';
	import { rollKey } from '../game/draft.ts';
	import TeamLogo from './TeamLogo.svelte';
	import { loadMedia, selectLogo } from '../media/client.ts';

	/** One open pack, a franchise or a jackpot, dealt face up as a card. */
	export interface DealtPack {
		roll: Roll;
		name?: string;
		years?: { first: number; last: number } | null;
		color?: string;
	}

	let { packs, pickNumber, pickCount, marks = [], disabled = false, extraPacks, addDisabled = false, returning = null, flyTarget, onOpen, onAddPack, onChoose, onArrive, onDealt }: {
		/** The open packs, in dealt order; the first arrives after `onOpen` commits the roll. */
		packs: readonly DealtPack[];
		pickNumber: number;
		pickCount: number;
		/** Franchise ids the sealed pack's coin turns through. */
		marks?: readonly string[];
		disabled?: boolean;
		/** Extra packs left of the draft's allowance, and the most one roll can hold. */
		extraPacks?: { left: number; total: number; max: number };
		/** The session cannot add a pack yet, such as while the dealt roll's pool loads. */
		addDisabled?: boolean;
		/** Where the dealt card lands: the header's roll identity. */
		flyTarget: () => HTMLElement | null;
		/** Commits the roll. */
		onOpen: () => void;
		/** Deals another pack beside the open ones; it arrives through `packs`. */
		onAddPack?: () => void;
		/**
		 * Where the taken roll and the Add pack control sat when a pack was added from the pool's toolbar:
		 * the taken card flows back down out of the roll identity and the new card deals out of the control.
		 */
		returning?: { card: DOMRect | null; control: DOMRect | null } | null;
		/** Keeps one of several open packs, by its dealt position; called as its card starts for the rail. */
		onChoose?: (pack: number) => void;
		/** The card is reaching the rail; the rail may show the roll. Fires before `onDealt`. */
		onArrive: () => void;
		/** The dealt card has landed, or dealing was abandoned. */
		onDealt: () => void;
	} = $props();

	/** Sealed → opening (tear and deal) → dealt (waits for the player to take one) → taking (flies to the rail). */
	type Stage = 'sealed' | 'opening' | 'dealt' | 'taking';
	// Packs added before a reload, or from the pool's toolbar, are already face up.
	let stage = $state<Stage>(untrack(() => packs.length > 1 ? 'dealt' : 'sealed'));
	let packGone = $state(untrack(() => packs.length > 1));
	let adding = $state(false);
	/** Remounts the ghost pack after one is spent, so the next fades in fresh. */
	let ghostKey = $state(0);
	let ghost = $state<HTMLButtonElement>();
	let ghostSeal = $state<HTMLElement>();
	let width = $state(0);
	let stageWidth = $state(0);
	/** The cards on the table, held while one is taken so the others can leave after the session keeps only it. */
	let held = $state<readonly DealtPack[] | null>(null);
	const shown = $derived(held ?? packs);
	const packKey = (pack: DealtPack) => rollKey(pack.roll);
	/** A faded pack right of the dealt cards offers another while the draft has extras left and the roll has room. */
	const ghostShown = $derived(!!extraPacks && !!onAddPack && (stage === 'dealt' || stage === 'taking' || adding) &&
		(adding || (extraPacks.left > 0 && shown.length < extraPacks.max)));
	const GAP = 12;
	/** The divider's line and trailing margin plus the flex gaps on both its sides. */
	const DIVIDER = 1 + GAP + 2 * GAP;
	/** Dealt cards sit lifted at 1.06 scale. */
	const LIFT = 1.06;
	/**
	 * The first card stays centered with the divider, added cards and ghost to its right, shrinking up to a fifth to fit.
	 * Otherwise a lone card keeps its place and the ghost narrows to peek in; with cards added, the row centers as a whole.
	 */
	const layout = $derived.by(() => {
		const full = stageWidth * .86;
		const right = shown.length - 1 + (ghostShown ? 1 : 0);
		const span = (count: number, size: number) => count ? DIVIDER + count * (size * LIFT + GAP) - GAP : 0;
		if (!width || full * LIFT / 2 + span(right, full) <= width / 2) return { anchored: true, size: full, ghost: full };
		// Slightly smaller cards keep the first one centered when the row only just misses fitting.
		const fitted = (width / 2 - DIVIDER + GAP - right * GAP) / (LIFT * (right + .5));
		if (right && fitted >= full * .8) return { anchored: true, size: fitted, ghost: fitted };
		if (shown.length === 1) return { anchored: true, size: full, ghost: Math.max(64, Math.min(full, width / 2 - full * LIFT / 2 - DIVIDER - 4)) };
		const count = shown.length + (ghostShown ? 1 : 0);
		const size = Math.min(full, (width - DIVIDER - (count - 1) * GAP) / count / LIFT);
		return { anchored: false, size, ghost: size };
	});
	/** The caption names what to tap only after the player hesitates, so the pack and card teach themselves. */
	let hinting = $state(false);
	$effect(() => {
		if (stage !== 'sealed' && stage !== 'dealt') return;
		void shown.length;
		hinting = false;
		const timer = setTimeout(() => hinting = true, MOTION.tapHint);
		return () => clearTimeout(timer);
	});
	let pack = $state<HTMLElement>();
	let seal = $state<HTMLElement>();
	const cards: Record<string, HTMLButtonElement | undefined> = $state({});
	const flippers: Record<string, HTMLElement | undefined> = $state({});
	const first = $derived(shown[0] ? cards[packKey(shown[0])] : undefined);
	const firstFlipper = $derived(shown[0] ? flippers[packKey(shown[0])] : undefined);
	function cardStyle(pack: DealtPack): string | undefined {
		const palette = pack.color ? roles({ primary: pack.color, secondary: STOCK }) : null;
		return palette ? `--deal-ground: ${palette.field}; --deal-ink: ${palette.onField};` : undefined;
	}
	const running = new Set<Animation>();
	let coin = $state<HTMLElement>();
	// Each pick starts the coin somewhere new in the league.
	let markIndex = $state(untrack(() => pickNumber * 7));
	const frontMark = $derived(marks.length ? marks[markIndex % marks.length] : null);
	const backMark = $derived(marks.length ? marks[(markIndex + 1) % marks.length] : null);

	/** The coin passes edge-on at each turn boundary, so both faces take the next two marks unseen. */
	function advanceMarks(): void {
		markIndex += 2;
	}

	/** Whips the coin through the league while the pack tears and the card pulls. */
	function spinFast(): void {
		for (const animation of coin?.getAnimations() ?? []) animation.updatePlaybackRate(MOTION.markSpinBurst);
	}

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
		const card = first, flipper = firstFlipper;
		if (!packs.length) {
			// The roll could not be committed; the session reports the error.
			stage = 'sealed';
			onDealt();
			return;
		}
		if (appSettings.effectiveEnabled) {
			spinFast();
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

	/** Fills in the ghost pack and opens it: the seal tears, the new card rises out and turns face up in its place, and the spent pack drops away. */
	async function addPack(): Promise<void> {
		if (stage !== 'dealt' || adding || addDisabled || !onAddPack || !ghostShown) return;
		adding = true;
		const motion = appSettings.effectiveEnabled;
		const before = new Map(shown.map(pack => [packKey(pack), cards[packKey(pack)]?.getBoundingClientRect()]));
		if (motion) {
			await play(ghost, [{ opacity: .4, filter: 'saturate(.3)' }, { opacity: 1, filter: 'none' }], { duration: MOTION.packTear });
			await play(ghostSeal, [{ transform: 'none', opacity: 1 }, { transform: 'translate(18%, -140%) rotate(9deg)', opacity: 0 }], { duration: MOTION.packTear });
		}
		const ghostFrom = ghost?.getBoundingClientRect();
		onAddPack();
		await tick();
		const added = packs.length > before.size ? packs.at(-1) : undefined;
		if (added && motion) {
			const key = packKey(added);
			const card = cards[key];
			// The spent pack stays over the new card's slot, and any card that moved slides from where it was.
			const to = card?.getBoundingClientRect();
			const ghostTo = ghost?.getBoundingClientRect();
			const offset = ghostFrom && ghostTo ? ghostFrom.left - ghostTo.left : 0;
			const spent = to && ghostTo ? to.left - ghostTo.left : 0;
			for (const [other, from] of before) {
				const element = cards[other];
				const now = element?.getBoundingClientRect();
				if (element && from && now && Math.abs(from.left - now.left) > .5) void play(element, [{ transform: `translateX(${from.left - now.left}px) scale(1.06)` }, { transform: 'scale(1.06)' }], { duration: MOTION.dealSettle });
			}
			if (ghost) ghost.style.translate = `${spent || -offset}px 0`;
			await play(card, [{ transform: 'translateY(0)' }, { transform: 'translateY(-45%)' }], { duration: MOTION.cardRise });
			await Promise.all([
				play(ghost, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(115%) rotate(-4deg)', opacity: 0 }], { duration: MOTION.packDrop, easing: EASE_IN_OUT }),
				play(card, [{ transform: 'translateY(-45%)' }, { transform: 'translateY(0) scale(1.06)' }], { duration: MOTION.dealSettle }),
				play(flippers[key], [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], { duration: MOTION.deal, delay: 60 })
			]);
		}
		ghostKey += 1;
		adding = false;
		if (added) {
			await tick();
			cards[packKey(added)]?.focus({ preventScroll: true });
		}
	}

	/** Slides the taken card into the rail while any other packs fall away; the rail then grows the franchise name and era. */
	async function take(pack: DealtPack): Promise<void> {
		if (stage !== 'dealt' || adding) return;
		stage = 'taking';
		const others = shown.filter(other => other !== pack);
		const index = shown.indexOf(pack);
		held = shown;
		if (others.length) onChoose?.(index);
		await tick();
		if (appSettings.effectiveEnabled) {
			for (const element of [...others.map(other => cards[packKey(other)]), ghost]) void play(element, [{ opacity: 1 }, { transform: 'translateY(60%) scale(.96)', opacity: 0 }], { duration: MOTION.packDrop, easing: EASE_IN_OUT, composite: 'add' });
			await fly(cards[packKey(pack)]);
		}
		onArrive();
		onDealt();
	}

	/** Moves the taken card onto the header roll identity and fades it there. */
	async function fly(card: HTMLButtonElement | undefined): Promise<void> {
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

	/** The transform that puts `element` over `rect`, from its laid-out place. */
	function over(element: HTMLElement, rect: DOMRect): string {
		const now = element.getBoundingClientRect();
		const dx = rect.left + rect.width / 2 - (now.left + now.width / 2);
		const dy = rect.top + rect.height / 2 - (now.top + now.height / 2);
		return `translate(${dx}px, ${dy}px) scale(${Math.max(.08, rect.height / now.height)})`;
	}

	/** The taken roll stretches back out of the header into the first card while the new card deals out of the Add pack control. */
	async function unfold({ card, control }: { card: DOMRect | null; control: DOMRect | null }): Promise<void> {
		await tick();
		const taken = cards[packKey(packs[0])];
		const added = packs.at(-1)!;
		const fresh = cards[packKey(added)];
		const settled = 'translateY(0) scale(1.06)';
		await Promise.all([
			card && taken ? play(taken, [{ transform: over(taken, card), opacity: .2, borderRadius: '50%' }, { opacity: 1, offset: .35 }, { transform: settled, opacity: 1 }], { duration: MOTION.deal }) : Promise.resolve(),
			control && fresh ? play(fresh, [{ transform: over(fresh, control), opacity: 0 }, { opacity: 1, offset: .25 }, { transform: settled, opacity: 1 }], { duration: MOTION.deal, delay: MOTION.deal * .25 }) : Promise.resolve(),
			play(flippers[packKey(added)], [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], { duration: MOTION.deal, delay: MOTION.deal * .4 })
		]);
	}

	onMount(() => {
		const release = appSettings.retain();
		// A fast spin shows a new mark every few frames; warm the cache so none of them flash in blank.
		void loadMedia().then(media => {
			for (const id of marks) {
				const url = selectLogo(media, id)?.asset.url;
				if (url) new Image().src = url;
			}
		}).catch(() => {});
		if (returning && appSettings.effectiveEnabled && packs.length > 1) void unfold(returning);
		// Each pack rises into place, so the screen it replaces hands off rather than cutting.
		else if (appSettings.effectiveEnabled) {
			const speed = appSettings.snapshot.cardSpeed || 1;
			void play(pack, [{ transform: 'translateY(3rem)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: MOTION.packEnter / speed, fill: 'backwards' });
		}
		return () => {
			for (const animation of running) animation.cancel();
			release();
		};
	});
</script>

<div class="foil-pack" class:opening={stage !== 'sealed'} class:dealt={stage === 'dealt' || stage === 'taking'} class:pack-gone={packGone} bind:clientWidth={width}>
	<div class="stage" bind:clientWidth={stageWidth}>
		<div class="hand" class:anchored={layout.anchored} style:--card-w="{layout.size}px" style:--ghost-w="{layout.ghost}px">
			{#each shown as pack, index (packKey(pack))}
				{#if index === 1}<span class="divider" aria-hidden="true"></span>{/if}
				<button
					type="button"
					class="dealt-card"
					bind:this={cards[packKey(pack)]}
					style={cardStyle(pack)}
					aria-hidden={stage === 'dealt' ? undefined : 'true'}
					aria-label={isJackpot(pack.roll) ? `Take the jackpot pack, ${pack.roll.jackpot.length} elite seasons` : `Take ${pack.name ?? pack.roll.franchiseId}${pack.years ? `, ${pack.years.first}–${pack.years.last}` : ''}`}
					tabindex={stage === 'dealt' ? 0 : -1}
					disabled={stage !== 'dealt'}
					onclick={() => void take(pack)}
				>
					<div class="flipper" bind:this={flippers[packKey(pack)]}>
						<div class="face back"><span class="back-mark"></span></div>
						{#if isJackpot(pack.roll)}
							<div class="face front jackpot" style:--foil={GEMHOLO}>
								<span class="jackpot-mark" aria-hidden="true"></span>
								<strong>Jackpot</strong>
								<span class="years">{pack.roll.jackpot.length} elite seasons</span>
							</div>
						{:else}
							<div class="face front">
								<TeamLogo franchiseId={pack.roll.franchiseId} label={pack.name ?? pack.roll.franchiseId} size="large" />
								<strong>{pack.name ?? pack.roll.franchiseId}</strong>
								{#if pack.years}<span class="years">{pack.years.first}–{pack.years.last}</span>{/if}
							</div>
						{/if}
					</div>
				</button>
			{/each}
			{#if ghostShown}
				{#if shown.length === 1}<span class="divider" aria-hidden="true"></span>{/if}
				{#key ghostKey}
					<button type="button" class="ghost-pack" bind:this={ghost} aria-label={`Add a franchise pack to choose from, ${extraPacks!.left} of ${extraPacks!.total} left`} disabled={stage !== 'dealt' || adding || addDisabled} onclick={() => void addPack()} style:--foil={SILVER}>
						<span class="seal" bind:this={ghostSeal} aria-hidden="true"></span>
						<span class="ghost-face" aria-hidden="true">
							<span class="ghost-plus">+</span>
							<span class="ghost-title">Extra pack</span>
							<span class="ghost-count">{extraPacks!.left} left</span>
						</span>
						<span class="seal bottom" aria-hidden="true"></span>
					</button>
				{/key}
			{/if}
		</div>
		<button id="roll-next" type="button" class="pack" bind:this={pack} aria-label="Roll next franchise" disabled={disabled || stage !== 'sealed'} onclick={open} style:--foil={SILVER}>
			<span class="seal" bind:this={seal} aria-hidden="true"></span>
			<span class="pack-face" aria-hidden="true">
				{#if frontMark && backMark}
					<span class="coin" class:spinning={appSettings.effectiveEnabled} style:--mark-spin="{MOTION.markSpin}ms" bind:this={coin} onanimationiteration={advanceMarks}>
						<span class="coin-face"><TeamLogo franchiseId={frontMark} size="small" /></span>
						<span class="coin-face coin-back"><TeamLogo franchiseId={backMark} size="small" /></span>
					</span>
				{/if}
				<span class="wordmark"><span class="mark"></span>162-0</span>
				<span class="pack-title">Franchise pack</span>
				<span class="pack-count">Pick {pickNumber} of {pickCount}</span>
			</span>
			<span class="seal bottom" aria-hidden="true"></span>
		</button>
	</div>
	<p class="caption" class:hidden={!hinting} aria-hidden="true">{stage === 'sealed' ? 'Tap the pack' : shown.length > 1 ? 'Take one pack' : 'Take the card'}</p>
</div>

<style>
	/* The dealt card rises 62% of its 7.4/5 height out of the pack, so the top padding reserves that rise below the sticky header. */
	.foil-pack { --stage-width: min(11.5rem, 52vw); container-type: inline-size; overflow-x: clip; display: grid; justify-items: center; gap: var(--space-3); padding-block: calc(var(--stage-width) * 7.4 / 5 * .62 + var(--space-4)) var(--space-8); }
	.stage { position: relative; display: grid; width: var(--stage-width); aspect-ratio: 5 / 7.4; perspective: 900px; }
	/* Phones have the pick header and field button above the pack; the dealt card rises over them instead of into reserved space. */
	.opening .stage { z-index: 6; }
	@media (max-width: 47.999rem) { .foil-pack { padding-block: var(--space-6) var(--space-6); } }
	.pack { grid-area: 1 / 1; }
	/* Added packs sit in one row centered on the pack that may run wider than it, sharing the column's width. */
	.hand { position: absolute; z-index: 1; inset: 0 auto; left: 50%; translate: -50% 0; display: flex; align-items: center; gap: 12px; width: max-content; }
	/* The first card stays where the pack was dealt; everything added sits to its right. */
	.hand.anchored { translate: calc(var(--card-w) / -2) 0; }
	.divider { flex: none; align-self: center; width: 1px; height: 70%; margin-inline: 12px; margin-inline-start: 0; background: var(--border); animation: ghost-in var(--motion-deal) var(--ease-out) var(--motion-deal) both; }
	.ghost-pack { --mx: 30%; position: relative; flex: none; display: grid; grid-template-rows: 9% 1fr 9%; width: var(--ghost-w); aspect-ratio: 5 / 7; padding: 0; border: 0; border-radius: .3rem; color: var(--background); background: var(--foil); overflow: hidden; opacity: .4; filter: saturate(.3); container-type: inline-size; cursor: pointer; transition: opacity .15s, filter .15s; animation: ghost-in var(--motion-deal) var(--ease-out) var(--motion-deal) backwards; }
	.ghost-pack:hover:not(:disabled), .ghost-pack:focus-visible { background: var(--foil); opacity: .65; filter: none; }
	.ghost-pack:disabled { cursor: default; }
	.ghost-pack:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
	.ghost-face { display: grid; align-content: center; justify-items: center; gap: 4cqi; margin-inline: 5cqi; color: var(--text); background: oklch(16% .012 255 / .92); border-block: 2px solid oklch(100% 0 0 / .6); }
	.ghost-plus { font: 300 32cqi / .8 system-ui, sans-serif; }
	.ghost-title { font: italic 900 12cqi / 1 'Barlow Condensed', sans-serif; letter-spacing: .02em; text-transform: uppercase; color: var(--accent); }
	.ghost-count { color: var(--muted); font-size: max(.625rem, 7.5cqi); font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
	@keyframes ghost-in { from { opacity: 0; } }
	:global([data-motion='off']) :is(.divider, .ghost-pack) { animation: none; }
	@media (prefers-reduced-motion: reduce) { :is(.divider, .ghost-pack) { animation: none; } }
	.dealt .hand { z-index: 3; }
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
	.coin { position: relative; width: 4.5rem; aspect-ratio: 1; margin-bottom: var(--space-1); transform-style: preserve-3d; transform: rotateY(0deg); }
	/* Each turn runs edge-on to edge-on, so the marks change where neither face can be seen. */
	.coin.spinning { animation: coin-turn var(--mark-spin) linear infinite; }
	.coin-face { position: absolute; inset: 0; display: grid; place-items: center; border: 2px solid oklch(100% 0 0 / .6); border-radius: 50%; background: oklch(96% .004 255); overflow: hidden; backface-visibility: hidden; box-shadow: inset 0 0 0 3px oklch(16% .012 255 / .9); }
	.coin-back { transform: rotateY(180deg); }
	/* 58% keeps a square mark's corners (its diagonal is 1.41× its side) inside the rim. */
	.coin-face :global(.team-mark) { width: 58%; height: auto; aspect-ratio: 1; }
	.coin-face :global(.team-mark img) { width: 100%; height: 100%; object-fit: contain; }
	@keyframes coin-turn { from { transform: rotateY(-90deg); } to { transform: rotateY(270deg); } }
	@media (prefers-reduced-motion: reduce) { .coin.spinning { animation: none; } }
	.wordmark { display: inline-flex; align-items: center; gap: .45rem; font-size: 1.35rem; font-weight: 850; letter-spacing: -.04em; }
	.mark { width: .55rem; height: .55rem; border: 2px solid currentColor; transform: rotate(45deg); }
	.pack-title { font: italic 900 1.15rem / 1 'Barlow Condensed', sans-serif; letter-spacing: .02em; text-transform: uppercase; color: var(--accent); }
	.pack-count { color: var(--muted); font-size: var(--text-xs); font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
	.dealt-card {
		position: relative;
		z-index: 1;
		flex: none;
		width: var(--card-w);
		aspect-ratio: 5 / 7;
		/* The face scales with the card, which narrows when three packs share a phone's width. */
		container-type: inline-size;
		visibility: hidden;
	}
	.opening .dealt-card { visibility: visible; }
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
	.front { gap: 4cqi; padding: 6cqi; }
	.front :global(.team-mark) { width: 66cqi; height: 66cqi; flex-basis: 66cqi; padding: 8cqi; }
	.front strong { font: italic 900 13.5cqi / 1 'Barlow Condensed', sans-serif; text-transform: uppercase; overflow-wrap: anywhere; }
	.years { font: italic 800 11cqi / 1 'Barlow Condensed', sans-serif; }
	/* A jackpot deals face up in the gem holo foil, drifting so it reads as special at a glance. */
	.front.jackpot { --mx: 50%; --my: 50%; color: oklch(22% .03 280); background: var(--foil); border-color: #fff; animation: holo-drift 3.2s ease-in-out infinite alternate; }
	.jackpot-mark { width: 34cqi; height: 34cqi; background: oklch(22% .03 280); clip-path: polygon(50% 0, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%); }
	@keyframes holo-drift { from { background-position: 0% 30%; } to { background-position: 100% 70%; } }
	:global([data-motion='off']) .front.jackpot { animation: none; }
	@media (prefers-reduced-motion: reduce) { .front.jackpot { animation: none; } }
	.caption { margin: 0; color: var(--muted); font-size: var(--text-sm); font-weight: 650; letter-spacing: .02em; transition: opacity var(--motion-deal) var(--ease-out); }
	/* The caption keeps its line while hidden so the hint appears without moving the stage. */
	.caption.hidden { opacity: 0; }
	@keyframes glint { 0%, 55% { background-position: 120% 0; } 100% { background-position: -120% 0; } }
	:global([data-motion='off']) .pack::after { animation: none; }
	@media (prefers-reduced-motion: reduce) { .pack::after { animation: none; } }
</style>
