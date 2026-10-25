<script lang="ts">
 import { COMMISSIONER, type Decree } from '../../draft/decrees.ts';

 /** The commissioner's memo for a decree: its name, Mad Fred's words and the rule in plain terms. */
 let { decree, label }: { decree: Decree; label: string } = $props();
</script>

<aside class="decree" aria-label={`${label}: ${decree.name}`}>
 <p class="label">{label}</p>
 <p class="name">{decree.name}</p>
 <p class="memo">“{decree.memo}” <span>— {COMMISSIONER}, Commissioner</span></p>
 <p class="rule">{decree.rule}</p>
</aside>

<style>
 .decree { display: grid; gap: var(--space-1); min-width: 0; padding: var(--space-3) var(--space-4); border-left: 3px solid var(--accent); background: color-mix(in oklch, var(--accent) 7%, transparent); }
 p { margin: 0; }
 .label { color: var(--muted); font-size: var(--text-xs); font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
 .name { font: italic 900 1.2rem / 1.1 'Barlow Condensed', sans-serif; letter-spacing: .02em; text-transform: uppercase; color: var(--accent); }
 .memo { font-size: var(--text-sm); font-style: italic; }
 .memo span { color: var(--muted); font-style: normal; white-space: nowrap; }
 .rule { font-size: var(--text-sm); }
</style>
