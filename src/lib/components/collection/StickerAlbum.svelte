<script lang="ts">
	import StickerBadge from '../../collection/StickerBadge.svelte';
	import type { Album } from '../../collection/album.ts';

	interface Props {
		album: Album;
		/** Shows the cards holding a sticker the player has earned. */
		onChoose: (kind: string) => void;
	}
	let { album, onChoose }: Props = $props();
</script>

<div class="album">
	{#each album.groups as group (group.title)}
		<section class="group" aria-labelledby="album-{group.title}">
			<h2 id="album-{group.title}">{group.title}</h2>
			{#each group.families as row (row.family)}
				<div class="family">
					<div class="family-head">
						<h3>{row.name}</h3>
						<span class="of">{row.earned} of {row.slots.length}</span>
					</div>
					<ul class="ladder" aria-label={`${row.name} stickers`}>
						{#each row.slots as slot (slot.definition.kind)}
							<li class="slot">
								{#if slot.held}
									<button type="button" class="earned" aria-label={`${slot.definition.title}: ${slot.held} ${slot.held === 1 ? 'card' : 'cards'}. Show them.`} onclick={() => onChoose(slot.definition.kind)}>
										<span class="badge" aria-hidden="true"><StickerBadge definition={slot.definition} /></span>
										<span class="held">{slot.held} {slot.held === 1 ? 'card' : 'cards'}</span>
									</button>
								{:else}
									<!-- Unearned: an embossed blank die-cut with its threshold printed, or ??? for a secret feat. -->
									<span class="blank" class:long={!slot.secret && slot.definition.label[0].length > 6} role="img" aria-label={slot.secret ? 'Secret sticker, not yet earned' : `${slot.definition.title}, not yet earned`}>
										{#if slot.secret}<b>???</b>{:else}<b>{slot.definition.label[0]}</b><small>{slot.definition.label[1]}</small>{/if}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</section>
	{/each}
</div>

<style>
	.album { display: grid; gap: var(--space-8); }
	.group { display: grid; gap: 0; }
	.group h2 { margin: 0 0 var(--space-2); font: italic 900 var(--text-xl) / 1 'Barlow Condensed', sans-serif; text-transform: uppercase; letter-spacing: .01em; }
	.family { display: grid; grid-template-columns: 9rem minmax(0, 1fr); gap: var(--space-4); align-items: center; padding-block: var(--space-4); border-top: 1px solid var(--border); }
	.family-head { display: grid; gap: var(--space-1); }
	h3 { margin: 0; font-size: var(--text-base); line-height: 1.2; }
	.of { color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
	.ladder { display: flex; flex-wrap: wrap; gap: var(--space-4) var(--space-3); margin: 0; padding: 0; list-style: none; }
	.slot { display: grid; justify-items: center; width: 4.25rem; }
	/* A badge is 21em of its font size: .17rem gives a sticker about 3.6rem across. */
	.badge { font-size: .17rem; line-height: 0; padding: .3rem; }
	.earned { display: grid; justify-items: center; gap: var(--space-1); padding: 0 0 var(--space-1); border: 0; border-radius: .5rem; background: none; color: var(--text); cursor: pointer; font: inherit; }
	.earned:hover .held { color: var(--text); }
	.earned:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
	.held { color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
	.blank {
		display: inline-grid; place-content: center; width: 3.57rem; aspect-ratio: 1; margin: .3rem; border-radius: 50%;
		background: var(--surface); box-shadow: inset 0 0 0 2px var(--border), inset 0 .15rem .3rem oklch(0% 0 0 / .35);
		color: var(--muted); font-family: 'Barlow Condensed', sans-serif; line-height: .9; text-align: center; text-transform: uppercase;
	}
	.blank b { font-size: 1.15rem; font-weight: 800; }
	.blank small { font-size: .6rem; font-weight: 700; letter-spacing: .04em; }
	/* As on the sticker itself, a first line longer than six characters steps down to stay inside the die cut. */
	.blank.long b { font-size: .85rem; }
	@media (max-width: 40rem) {
		.family { grid-template-columns: minmax(0, 1fr); gap: var(--space-2); }
		.family-head { display: flex; align-items: baseline; gap: var(--space-2); }
		.slot { width: 3.6rem; }
		.badge { font-size: .14rem; padding: .25rem; }
		.blank { width: 2.94rem; margin: .25rem; }
		.blank b { font-size: .95rem; }
		.blank small { font-size: .5rem; }
		.blank.long b { font-size: .7rem; }
	}
</style>
