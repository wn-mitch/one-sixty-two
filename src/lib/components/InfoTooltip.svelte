<script lang="ts">
 let { label, text }: { label: string; text: string } = $props();
 const uid = $props.id();
 let active = $state(false);
 let root = $state<HTMLElement>();
 let tooltip = $state<HTMLElement>();
 const tooltipId = `${uid}-tooltip`;

 function clampTooltip(): void {
  if (!tooltip) return;
  tooltip.style.transform = '';
  const rect = tooltip.getBoundingClientRect();
  const shift = Math.max(8 - rect.left, Math.min(innerWidth - 8 - rect.right, 0));
  tooltip.style.transform = `translateX(${shift}px)`;
 }

 $effect(() => {
  if (!active || !tooltip) return;
  const frame = requestAnimationFrame(clampTooltip);
  return () => cancelAnimationFrame(frame);
 });
</script>

<svelte:window onpointerdown={event => { if (!(event.target instanceof Node) || !root?.contains(event.target)) active = false; }} onkeydown={event => { if (event.key === 'Escape') active = false; }} onresize={clampTooltip} />
 
<div bind:this={root} class="info-tooltip" role="group" aria-label={`${label} help`} onpointerenter={event => { if (event.pointerType !== 'touch') active = true; }} onpointerleave={event => { if (!event.currentTarget.contains(document.activeElement)) active = false; }}>
 <button type="button" class="quiet trigger" aria-label={`About ${label}`} aria-describedby={active ? tooltipId : undefined} onfocus={() => active = true} onblur={() => active = false} onclick={() => active = true} onkeydown={event => { if (event.key === 'Escape') active = false; }}><span aria-hidden="true">?</span></button>
 {#if active}<div bind:this={tooltip} class="tooltip" role="tooltip" id={tooltipId}>{text}</div>{/if}
</div>

<style>
 .info-tooltip { position: relative; display: inline-flex; align-items: center; }
 .trigger { display: grid; place-items: center; width: 44px; min-width: 44px; min-height: 44px; padding: 0; color: var(--muted); }
 .trigger span { display: grid; place-items: center; width: 1.25rem; height: 1.25rem; border: 1px solid color-mix(in oklab, var(--muted) 55%, transparent); border-radius: 50%; background: color-mix(in oklab, var(--muted) 10%, transparent); color: color-mix(in oklab, var(--muted) 75%, transparent); font-size: var(--text-xs); line-height: 1; }
 .tooltip { position: absolute; z-index: 5; top: calc(100% - var(--space-2) - 1px); right: 0; width: min(22rem, calc(100vw - 2rem)); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-raised); color: var(--text); font-size: var(--text-sm); line-height: 1.5; font-weight: 400; }
</style>

