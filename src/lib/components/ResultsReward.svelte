<script module lang="ts">
	import type { SeasonReward } from '../cosmetics/ledger.ts';
	// A save supplies one receipt object. Remounting that same result must not replay its celebration.
	const presented = new WeakSet<SeasonReward>();
</script>

<script lang="ts">
	import { appSettings } from '../game/settings.svelte.ts';
	import { EASE_IN_OUT, EASE_OUT, MOTION } from '../motion-timing.ts';
	import TokenAmount from './TokenAmount.svelte';

	let { reward, ownSeason }: { reward: SeasonReward | null; ownSeason: boolean } = $props();
	const earned = $derived(ownSeason && reward ? reward.season + reward.bonus : 0);
	const breakdown = $derived(reward ? `${reward.season} season ${reward.season === 1 ? 'token' : 'tokens'}${reward.bonus ? ` + ${reward.bonus} first-season bonus` : ''}` : '');
	let announcement = $state('');

	function celebrate(node: HTMLAnchorElement, receipt: SeasonReward) {
		if (presented.has(receipt)) return;
		presented.add(receipt);
		const total = receipt.season + receipt.bonus;
		announcement = `${total} ${total === 1 ? 'token' : 'tokens'} earned: ${breakdown}. Added to your Shop wallet.`;
		const release = appSettings.retain();
		const animations = new Set<Animation>();
		let ghost: HTMLElement | null = null;
		let splash: HTMLElement | null = null;
		let stopped = false;
		const opacity = node.style.opacity;
		const stop = () => {
			stopped = true;
			for (const animation of animations) animation.cancel();
			animations.clear();
			ghost?.remove();
			splash?.remove();
			node.style.opacity = opacity;
		};
		const unsubscribe = appSettings.subscribe(settings => { if (!settings.effectiveEnabled) stop(); });
		const onHidden = () => { if (document.hidden) stop(); };
		window.addEventListener('resize', stop);
		document.addEventListener('visibilitychange', onHidden);
		node.addEventListener('focus', stop);

		function wallet(): HTMLElement | undefined {
			return [...document.querySelectorAll<HTMLElement>('[data-token-wallet]')].find(target => {
				const rect = target.getBoundingClientRect();
				return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth && getComputedStyle(target).visibility !== 'hidden';
			});
		}
		async function play(element: HTMLElement, frames: Keyframe[], duration: number, easing = EASE_OUT): Promise<void> {
			const animation = element.animate(frames, { duration, easing, fill: 'both' });
			animations.add(animation);
			await animation.finished;
		}
		async function fly(): Promise<void> {
			if (stopped || document.hidden || !wallet()) return;
			try {
				// Let the record handoff focus and scroll to the top before measuring the wallet.
				node.style.opacity = '0';
				await play(node, [{ opacity: 0 }, { opacity: 0 }], MOTION.screenRise * 2);
				if (stopped || !wallet()) return;
				window.addEventListener('scroll', stop, { passive: true });
				const rect = node.getBoundingClientRect();
				const gap = parseFloat(getComputedStyle(node).columnGap);
				const toolbar = document.querySelector<HTMLElement>('.share-shortcuts');
				const bottom = toolbar && getComputedStyle(toolbar).position === 'fixed' ? toolbar.getBoundingClientRect().top : innerHeight;
				const left = (innerWidth - rect.width) / 2;
				const top = bottom - rect.height - gap;
				ghost = node.cloneNode(true) as HTMLElement;
				ghost.removeAttribute('href');
				ghost.removeAttribute('aria-label');
				ghost.setAttribute('aria-hidden', 'true');
				ghost.setAttribute('inert', '');
				ghost.dataset.rewardFlight = '';
				Object.assign(ghost.style, { position: 'fixed', left: `${left}px`, top: `${top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', zIndex: '40', pointerEvents: 'none' });
				document.body.append(ghost);
				await play(ghost, [
					{ transform: `perspective(24rem) translateY(${innerHeight - top}px) rotateX(-100deg) scale(.8)`, opacity: 0 },
					{ transform: 'perspective(24rem) translateY(0) rotateX(0) scale(1)', opacity: 1 }
				], MOTION.rewardRise);
				if (stopped) return;
				await play(ghost, [{ transform: 'none' }, { transform: 'none' }], MOTION.rewardHold);
				const target = wallet();
				if (stopped || !target) return;
				const to = target.getBoundingClientRect();
				const dx = to.left + to.width / 2 - left - rect.width / 2;
				const dy = to.top + to.height / 2 - top - rect.height / 2;
				await play(ghost, [
					{ transform: 'translate(0, 0) scale(1)', opacity: 1 },
					{ transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: 0 }
				], MOTION.rewardFlight, EASE_IN_OUT);
				if (stopped) return;
				ghost.remove();
				node.style.opacity = opacity;
				splash = document.createElement('span');
				splash.className = 'reward-splash';
				splash.setAttribute('aria-hidden', 'true');
				const size = Math.max(to.width, to.height);
				Object.assign(splash.style, { left: `${to.left + to.width / 2 - size / 2}px`, top: `${to.top + to.height / 2 - size / 2}px`, width: `${size}px`, height: `${size}px` });
				document.body.append(splash);
				await Promise.all([
					play(splash, [{ transform: 'scale(.4) rotate(0deg)', opacity: 1 }, { transform: 'scale(2) rotate(20deg)', opacity: 0 }], MOTION.rewardSplash),
					play(target, [{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], MOTION.rewardSplash)
				]);
			} catch (error) {
				if (!stopped && !(error instanceof DOMException && error.name === 'AbortError')) console.error('Unable to animate earned tokens', error);
			}
			finally { stop(); }
		}
		void fly();
		return { destroy() {
			stop();
			unsubscribe();
			release();
			window.removeEventListener('resize', stop);
			window.removeEventListener('scroll', stop);
			document.removeEventListener('visibilitychange', onHidden);
			node.removeEventListener('focus', stop);
		} };
	}
</script>

<div class="results-outcome">
	<p class="sr-only" role="status" aria-atomic="true">{announcement}</p>
	{#if reward && earned > 0}
		{#key reward}
			<div class="earned-receipt">
				<a class="reward-chip" href="/shop" title={breakdown} aria-label={`${earned} ${earned === 1 ? 'token' : 'tokens'} earned: ${breakdown}. Choose a card finish in the Shop`} use:celebrate={reward}>
					<span class="earned-amount" aria-hidden="true">+<TokenAmount amount={earned} /></span><span>Earned <span aria-hidden="true">↗</span></span>
				</a>
			</div>
		{/key}
	{/if}
</div>

<style>
	.results-outcome { min-width: 0; justify-self: end; }
	.earned-receipt { display: flex; align-items: center; }
	.reward-chip { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 2.75rem; padding: var(--space-1) var(--space-2); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--muted); text-decoration: none; font: 650 var(--text-sm)/1.2 var(--font-control); }
	.reward-chip:hover { background: var(--surface-hover); color: var(--text); }
	.earned-amount { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--accent); font-size: var(--text-lg); font-weight: 750; }
	:global(.reward-splash) { position: fixed; z-index: 40; pointer-events: none; border: var(--space-1) dotted var(--accent); border-radius: 50%; }
	:global(.reward-splash)::after { content: ''; position: absolute; inset: var(--space-2); border: 1px solid var(--accent); border-radius: 50%; }
</style>
