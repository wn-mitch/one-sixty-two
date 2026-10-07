<script lang="ts">
 import type { Supplemental } from './view-model.ts';
 let { details, id }: { details: Supplemental; id?: string } = $props();
</script>

<section class="supplemental" {id} aria-label="Card provenance and model details" tabindex="-1">
 <h3>{details.title}</h3>
 {#each details.sections as section}
  <section aria-label={section.h}>
   <h4>{section.h}</h4>
   <dl>
    {#each section.rows as row}
     <div><dt>{row.k}</dt><dd>{#if row.href}<a href={row.href} target="_blank" rel="noreferrer">{row.v}</a>{:else}{row.v}{/if}</dd></div>
    {/each}
   </dl>
  </section>
 {/each}
</section>

<style>
 .supplemental { font-family: system-ui, sans-serif; font-size: 1rem; line-height: 1.5; color: var(--text); text-align: left; }
 h3 { font-size: 1.25rem; margin: 0 0 1rem; }
 h4 { font-size: 1rem; margin: 0 0 .5rem; }
 section > section { padding-block: 1rem; border-top: 1px solid var(--border); }
 dl { margin: 0; display: grid; gap: .75rem; }
 dt { font-weight: 700; }
 dd { margin: .2rem 0 0; overflow-wrap: anywhere; max-width: 70ch; }
 a { display: inline-flex; align-items: center; min-height: 2.75rem; }
</style>
