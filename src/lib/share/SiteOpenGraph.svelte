<script lang="ts">
	import Card from '../cards/Card.svelte';
	import type { CardViewModel } from '../cards/view-model.ts';
	import { dailyLabel } from '../game/daily.ts';

	/**
	 * The site's 1200×630 link preview: the pitch, and the daily stamp when it is captured for a `date`, on the
	 * left and a hand of era cards fanned and tipped back on the right. Roster links use their own published preview.
	 */
	let { cards, date = null }: { cards: readonly CardViewModel[]; date?: string | null } = $props();
	// One card per era, oldest to newest, so the hand shows the range of card designs.
	const fan = $derived([...new Map(cards.map(card => [card.era, card])).values()].sort((a, b) => a.era.localeCompare(b.era)).slice(-7));
	function ignoreCardDetails(): void { /* Front-only capture has no details action. */ }
</script>

<section class="og" data-site-og aria-label="162-0 link preview">
	<div class="copy">
		<strong class="wordmark"><i aria-hidden="true"></i>162-0</strong>
		<p>Draft sixteen historical seasons. Play all 162 games. Don’t lose one.</p>
		{#if date}<span class="daily">Daily <b>{dailyLabel(date)}</b></span>{/if}
		<span class="cta">Play at <em>162-0.dev</em></span>
	</div>
	<div class="fan" aria-hidden="true">
		{#each fan as card, index (card.seasonId)}
			<span class="fan-card" style={`--i:${index};--n:${fan.length}`}>
				<Card s={card} face="front" capture interactive={false} onDetails={ignoreCardDetails} />
			</span>
		{/each}
	</div>
</section>

<style>
	/* Every length is a share of the frame's width, so any render size matches the 1200×630 export. */
	.og { position:relative; box-sizing:border-box; width:100%; aspect-ratio:1200/630; container-type:inline-size; overflow:hidden; background:radial-gradient(120% 140% at 85% 30%, oklch(26% .02 255), oklch(14% .009 255) 60%); color:oklch(97% .006 255); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; line-height:1; isolation:isolate; }
	.copy { position:absolute; z-index:2; left:5cqw; top:6.5cqw; bottom:6.5cqw; width:38cqw; display:flex; flex-direction:column; align-items:flex-start; gap:2.2cqw; }
	.wordmark { display:inline-flex; align-items:center; gap:1.6cqw; font-size:8.5cqw; font-weight:850; letter-spacing:-.05em; }
	.wordmark i { display:block; width:3cqw; height:3cqw; border:.6cqw solid currentColor; transform:rotate(45deg); }
	p { margin:0; max-width:37cqw; color:oklch(80% .018 255); font-size:2.8cqw; line-height:1.3; }
	/* The daily run's stamp, as on results and share images. */
	.daily { padding:.8cqw 1.5cqw; border:.3cqw solid oklch(83% .16 120); color:oklch(83% .16 120); font:italic 800 3.2cqw / 1 'Barlow Condensed', sans-serif; letter-spacing:.06em; text-transform:uppercase; white-space:nowrap; transform:rotate(-3deg); transform-origin:left center; }
	.daily b { color:oklch(97% .006 255); font-weight:800; }
	.cta { margin-top:auto; white-space:nowrap; font-size:2.8cqw; font-weight:800; letter-spacing:-.02em; }
	.cta em { font-style:normal; color:oklch(83% .16 120); }
	/* Seven cards fanned from a pivot below the frame and tipped back in perspective. */
	.fan { position:absolute; inset:0 3cqw 0 44cqw; perspective:120cqw; }
	.fan-card { --w:22cqw; position:absolute; left:calc(50% - var(--w) / 2); top:9cqw; width:var(--w); transform-origin:50% 190%; transform:rotateX(10deg) rotate(calc((var(--i) - (var(--n) - 1) / 2) * 8deg)); filter:drop-shadow(0 1.2cqw 1.6cqw oklch(0% 0 0 / .55)); }
</style>
