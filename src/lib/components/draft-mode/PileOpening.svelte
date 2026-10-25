<script lang="ts">
 import { onMount } from 'svelte';
 import SealedPack from '../SealedPack.svelte';
 import DecreeMemo from './DecreeMemo.svelte';
 import type { Decree } from '../../draft/decrees.ts';
 import { appSettings } from '../../game/settings.svelte.ts';
 import { EASE_IN_OUT, EASE_OUT, MOTION } from '../../motion-timing.ts';

 /**
  * The seat's sealed packs before the first pick, under the opening decree. Tapping either tears both
  * open the way a franchise pack tears; the packs fall away and their cards deal into the pile.
  */
 let { packs, packSize, pickCount, decree, onOpen }: { packs: number; packSize: number; pickCount: number; decree: Decree; onOpen: () => void } = $props();
 const elements: (HTMLButtonElement | undefined)[] = $state([]);
 const seals: (HTMLElement | undefined)[] = $state([]);
 let opening = $state(false);

 function play(element: HTMLElement | undefined, keyframes: Keyframe[], options: KeyframeAnimationOptions): Promise<void> {
  if (!element) return Promise.resolve();
  return element.animate(keyframes, { fill: 'forwards', easing: EASE_OUT, ...options }).finished.then(() => undefined, () => undefined);
 }

 async function open(): Promise<void> {
  if (opening) return;
  opening = true;
  if (appSettings.effectiveEnabled) {
   const speed = appSettings.snapshot.cardSpeed || 1;
   await Promise.all([
    ...seals.map(seal => play(seal, [{ transform: 'none', opacity: 1 }, { transform: 'translate(18%, -140%) rotate(9deg)', opacity: 0 }], { duration: MOTION.packTear / speed })),
    ...elements.map(pack => play(pack, [{ transform: 'none' }, { transform: 'translateY(.35rem) rotate(-1deg)' }], { duration: MOTION.packTear / speed }))
   ]);
   await Promise.all(elements.map((pack, index) => play(pack, [{ transform: 'translateY(.35rem) rotate(-1deg)', opacity: 1 }, { transform: `translateY(115%) rotate(${index ? 4 : -4}deg)`, opacity: 0 }], { duration: MOTION.packDrop / speed, easing: EASE_IN_OUT })));
  }
  onOpen();
 }

 onMount(() => {
  const release = appSettings.retain();
  if (appSettings.effectiveEnabled) {
   const speed = appSettings.snapshot.cardSpeed || 1;
   for (const pack of elements) void play(pack, [{ transform: 'translateY(3rem)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: MOTION.packEnter / speed, fill: 'backwards' });
  }
  return release;
 });
</script>

<div class="pile-opening">
 <div class="packs">
  {#each { length: packs } as _, index (index)}
   <div class="stage">
    <SealedPack id={index === 0 ? 'roll-next' : undefined} label={`Open your ${packs} packs`} identity={`draft-pack-${index}`} disabled={opening} sealed={!opening} bind:element={elements[index]} bind:seal={seals[index]} onclick={() => void open()}>
     <span class="wordmark"><span class="mark"></span>162-0</span>
     <span class="pack-title">Draft pack</span>
     <span class="pack-count">{packSize} cards</span>
    </SealedPack>
   </div>
  {/each}
 </div>
 <p class="caption">Open your packs. Each pick, the pile you hold passes left; {pickCount} picks in all.</p>
 <div class="decree"><DecreeMemo {decree} label="Opening decree" /></div>
</div>

<style>
 .pile-opening { display: grid; justify-items: center; gap: var(--space-4); padding-block: var(--space-8); }
 .packs { display: flex; justify-content: center; gap: var(--space-4); width: 100%; }
 .stage { display: grid; width: min(10rem, 40vw); aspect-ratio: 5 / 7.4; }
 .wordmark { display: inline-flex; align-items: center; gap: .45rem; font-size: 1.2rem; font-weight: 850; letter-spacing: -.04em; }
 .mark { width: .55rem; height: .55rem; border: 2px solid currentColor; transform: rotate(45deg); }
 .pack-title { font: italic 900 1.05rem / 1 'Barlow Condensed', sans-serif; letter-spacing: .02em; text-transform: uppercase; color: var(--accent); }
 .pack-count { color: var(--muted); font-size: var(--text-xs); font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
 .decree { width: min(100%, 30rem); }
 .caption { max-width: 34ch; margin: 0; color: var(--muted); font-size: var(--text-sm); text-align: center; }
</style>
