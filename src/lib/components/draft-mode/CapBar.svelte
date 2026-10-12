<script lang="ts">
 import { money } from './format.ts';
 let { payroll, cap }: { payroll: number; cap: number } = $props();
 const over = $derived(payroll > cap);
 const share = $derived(Math.min(100, cap > 0 ? payroll / cap * 100 : 0));
</script>

<div class="cap" class:over>
 <p><strong>{money(payroll)}</strong> of {money(cap)} cap · {over ? `${money(payroll - cap)} over` : `${money(cap - payroll)} room`}</p>
 <div class="bar" role="meter" aria-label="Payroll against the cap" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={payroll} aria-valuetext={`${money(payroll)} of ${money(cap)}`}>
  <span style:width={`${share}%`}></span>
 </div>
</div>

<style>
 .cap { display: grid; gap: var(--space-1); min-width: 12rem; }
 p { margin: 0; font-size: var(--text-xs); color: var(--muted); }
 strong { color: var(--text); }
 .bar { height: .5rem; border-radius: 999px; background: var(--surface-raised); overflow: hidden; }
 .bar span { display: block; height: 100%; background: var(--success); }
 .over strong, .over p { color: var(--error); }
 .over .bar span { background: var(--error); }
</style>
