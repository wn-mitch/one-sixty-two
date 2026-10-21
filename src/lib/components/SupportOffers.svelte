<script lang="ts">
	import { onMount } from 'svelte';
	import { buyCoins, loadOffers, syncPurchases, type CoinOffer } from '../cosmetics/support.ts';
	import { toasts } from '../toast.svelte.ts';

	// Shown only inside the iOS app; the App Store supplies every price, and billing starts only on a tapped offer.
	let offers = $state.raw<CoinOffer[] | null>(null);
	let error = $state('');
	let status = $state('');
	let buying = $state<string | null>(null);

	async function load(): Promise<void> {
		error = '';
		try {
			offers = await loadOffers();
			if (!offers.length) error = 'Token packs are unavailable right now.';
		} catch (caught) {
			offers = [];
			error = caught instanceof Error ? caught.message : 'The App Store could not be reached.';
		}
	}

	async function buy(offer: CoinOffer): Promise<void> {
		if (buying) return;
		buying = offer.productId;
		status = '';
		try {
			const outcome = await buyCoins(offer.productId);
			if (outcome === 'purchased') toasts.show(`${offer.coins} tokens added. Thank you for supporting 162-0.`, { id: 'shop' });
			else if (outcome === 'pending') status = 'Waiting for approval. The tokens arrive once the App Store approves the purchase.';
		} catch (caught) {
			toasts.show(caught instanceof Error ? caught.message : 'The purchase did not finish. Please retry.', { id: 'shop', tone: 'error' });
			// A charge that went through but failed to save is retried from the App Store's own record.
			void syncPurchases().catch(() => {});
		} finally { buying = null; }
	}

	onMount(() => { void load(); });
</script>

<section class="support" aria-labelledby="support-heading">
	<h2 id="support-heading">Support 162-0</h2>
	<p>Earn a token with every season you finish, or buy extras to support the game. <a href="/factory">Card factory</a> is always free.</p>
	{#if offers === null}
		<p class="muted" role="status">Loading prices…</p>
	{:else if offers.length}
		<ul class="offers">
			{#each offers as offer (offer.productId)}
				<li>
					<button type="button" disabled={!!buying} aria-busy={buying === offer.productId} onclick={() => void buy(offer)}>
						<span class="quantity">{offer.coins} tokens</span>
						<span class="price">{offer.displayPrice}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if error}<p class="notice" role="status">{error} <button type="button" class="retry" onclick={() => void load()}>Retry</button></p>{/if}
	{#if status}<p class="muted" role="status">{status}</p>{/if}
	<p class="fine">Purchased tokens are the same tokens you earn by playing. They unlock cosmetic finishes only and never expire. The App Store keeps your purchases, so reinstalling the app or signing in on another device adds them back.</p>
</section>

<style>
	.support { display: grid; gap: var(--space-3); padding-top: var(--space-4); border-top: 1px solid var(--border); }
	h2 { margin: 0; font-size: var(--text-xl); }
	p { margin: 0; }
	.offers { display: grid; grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr)); gap: var(--space-3); max-width: 36rem; margin: 0; padding: 0; list-style: none; }
	.offers button { display: grid; justify-items: center; gap: var(--space-1); width: 100%; padding-block: var(--space-3); }
	.quantity { font-variant-numeric: tabular-nums; }
	.price { color: var(--muted); font-variant-numeric: tabular-nums; }
	.retry { min-height: 2.25rem; margin-left: var(--space-2); }
	.fine { color: var(--muted); font-size: var(--text-sm); }
</style>
