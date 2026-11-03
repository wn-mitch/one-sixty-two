<script lang="ts">
 import { COMMISSIONER, COMMISSIONER_SEAL, decreeIcon, type Decree } from '../../draft/decrees.ts';

 /** The commissioner's memo for a decree: its icon and name, Mad Fred's sealed words and the rule in plain terms. */
 let { decree, label }: { decree: Decree; label: string } = $props();
</script>

<aside class="decree" aria-label={`${label}: ${decree.name}`}>
 <span class="icon" style:--icon={`url(${decreeIcon(decree.id)})`} aria-hidden="true"></span>
 <div class="text">
  <p class="label">{label}</p>
  <p class="name">{decree.name}</p>
  <p class="memo">“{decree.memo}” <span class="sign"><span class="seal" style:--icon={`url(${COMMISSIONER_SEAL})`} aria-hidden="true"></span>{COMMISSIONER}, Commissioner</span></p>
  <p class="rule">{decree.rule}</p>
 </div>
</aside>

<style>
 .decree { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: var(--space-3); min-width: 0; padding: var(--space-3) var(--space-4); border-left: 3px solid var(--accent); background: color-mix(in oklch, var(--accent) 7%, transparent); }
 .text { display: grid; gap: var(--space-1); min-width: 0; }
 .icon, .seal { -webkit-mask: var(--icon) center / contain no-repeat; mask: var(--icon) center / contain no-repeat; }
 .icon { width: 3.5rem; aspect-ratio: 1; background: var(--accent); }
 p { margin: 0; }
 .label { color: var(--muted); font-size: var(--text-xs); font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
 .name { font: italic 900 1.2rem / 1.1 'Barlow Condensed', sans-serif; letter-spacing: .02em; text-transform: uppercase; color: var(--accent); }
 .memo { font-size: var(--text-sm); font-style: italic; }
 .sign { display: inline-flex; align-items: center; gap: .3em; color: var(--muted); font-style: normal; white-space: nowrap; vertical-align: middle; }
 .seal { width: 1.5em; aspect-ratio: 1; background: currentColor; }
 .rule { font-size: var(--text-sm); }
 @media (max-width: 30rem) { .icon { width: 2.75rem; } }
</style>
