<script lang="ts">
 import { money } from './format.ts';
 /**
  * Payroll against the cap. The full form leads with payroll and room, adding the average room per
  * open roster spot when `spots` is given; the compact form is one labelled meter for a side panel.
  */
 let { payroll, cap, spots, compact = false }: { payroll: number; cap: number; spots?: number; compact?: boolean } = $props();
 const over = $derived(payroll > cap);
 const room = $derived(cap - payroll);
 const share = $derived(Math.min(100, cap > 0 ? payroll / cap * 100 : 0));
</script>

<div class="cap" class:over class:compact>
 {#if compact}
  <p class="row"><span class="label">Payroll</span><span><strong>{money(payroll)}</strong> / {money(cap)}</span></p>
 {:else}
  <div class="head">
   <p class="figure"><span class="label">Payroll</span><strong>{money(payroll)}</strong><span class="of">of {money(cap)} cap</span></p>
   <p class="room">
    <strong>{over ? `${money(-room)} over` : `${money(room)} room`}</strong>
    {#if spots && !over}<span>≈ {money(Math.floor(room / spots))} per open spot</span>{/if}
   </p>
  </div>
 {/if}
 <div class="bar" role="meter" aria-label="Payroll against the cap" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={payroll} aria-valuetext={`${money(payroll)} of ${money(cap)}`}>
  <span style:width={`${share}%`}></span>
 </div>
</div>

<style>
 .cap { display: grid; gap: var(--space-2); min-width: min(100%, 22rem); }
 p { margin: 0; }
 .head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--space-2) var(--space-4); }
 .label { display: block; color: var(--muted); font-size: var(--text-xs); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
 .figure strong { font-family: var(--font-display, inherit); font-size: var(--text-xl); font-variant-numeric: tabular-nums; line-height: 1; }
 .of { margin-left: var(--space-2); color: var(--muted); font-size: var(--text-sm); }
 .room { display: grid; justify-items: end; gap: 2px; }
 .room strong { padding: .15rem .55rem; border-radius: 999px; background: color-mix(in oklch, var(--success) 18%, transparent); color: var(--success); font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
 .room span { color: var(--muted); font-size: var(--text-xs); }
 .bar { height: .625rem; border-radius: 999px; background: var(--surface-raised); overflow: hidden; }
 .bar span { display: block; height: 100%; border-radius: inherit; background: var(--success); transition: width 360ms var(--ease-out); }
 .over .figure strong, .over .room strong { color: var(--error); }
 .over .room strong { background: color-mix(in oklch, var(--error) 18%, transparent); }
 .over .bar span { background: var(--error); }
 .compact { gap: var(--space-1); min-width: 0; }
 .compact .row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-2); color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
 .compact strong { color: var(--text); }
 .compact .bar { height: .375rem; }
</style>
