<script lang="ts" module>
 export interface BrowseOption { value: string; label?: string; count?: number }
</script>

<script lang="ts">
 import type { Snippet } from 'svelte';
 import { MediaQuery } from 'svelte/reactivity';

 /**
  * The card-browsing layout every card list shares: search, a sort switch and filter chips with
  * counts in a rail beside the cards on wide screens, and above them on phones with the filters
  * behind a toggle. Owners keep the state; the browser only renders it and reports choices.
  */
 let {
  label,
  wide: wideOverride,
  busy = false,
  query = $bindable(''),
  searchLabel = 'Find a card',
  onBeforeSearch,
  onSearch,
  sorts,
  sort,
  descending,
  onSort,
  filters = [],
  filter = '',
  filterLegend = 'Filter',
  filterToggle = 'Filters',
  onFilter,
  rail,
  children,
  resultsId
 }: {
  /** Accessible name of the whole browser. */
  label: string;
  /** Rail beside the cards; defaults to screens at least 48rem wide. */
  wide?: boolean;
  busy?: boolean;
  query?: string;
  searchLabel?: string;
  /** Runs before a keystroke changes the query, so an owner can measure the cards first. */
  onBeforeSearch?: () => void;
  onSearch?: () => void;
  sorts: readonly BrowseOption[];
  sort: string;
  /** When set, the active sort shows its direction and choosing it again asks to reverse. */
  descending?: boolean;
  onSort: (value: string) => void;
  filters?: readonly BrowseOption[];
  filter?: string;
  filterLegend?: string;
  filterToggle?: string;
  onFilter?: (value: string) => void;
  /** Extra rail controls under the filters, such as a checkbox or a status line. */
  rail?: Snippet<[]>;
  children: Snippet<[]>;
  resultsId?: string;
 } = $props();

 const uid = $props.id();
 const wideScreen = new MediaQuery('(min-width: 48rem)');
 const wide = $derived(wideOverride ?? wideScreen.current);
 let filtersOpen = $state(false);
 const activeFilter = $derived(filters.find(option => option.value === filter));
 const firstFilter = $derived(filters[0]?.value);
</script>

<section class="browser" class:wide aria-label={label} aria-busy={busy}>
 <div class="rail">
  <div class="search-row">
   <label for="{uid}-search" class="sr-only">{searchLabel}</label>
   <span class="search-field">
    <input id="{uid}-search" type="search" placeholder="Search" bind:value={query} onbeforeinput={() => onBeforeSearch?.()} oninput={() => onSearch?.()} disabled={busy} />
    {#if query}<button type="button" class="quiet clear-search" aria-label="Clear search" disabled={busy} onclick={() => { onBeforeSearch?.(); query = ''; onSearch?.(); }}>×</button>{/if}
   </span>
   {#if !wide && filters.length}
    <button type="button" class="secondary filters-toggle" class:active={filter !== firstFilter} aria-expanded={filtersOpen} aria-controls="{uid}-filters" onclick={() => filtersOpen = !filtersOpen}>
     {filterToggle}{#if activeFilter && filter !== firstFilter}<span class="filters-badge">{activeFilter.label ?? activeFilter.value}</span>{/if}
    </button>
   {/if}
  </div>
  <div class="sort-row" role="group" aria-labelledby="{uid}-sort-label">
   <span id="{uid}-sort-label" class="sort-label">Sort by</span>
   <span class="sort-options" class:stacked={sorts.length > 2}>
    {#each sorts as option (option.value)}
     {@const active = sort === option.value}
     <button type="button" aria-pressed={active} disabled={busy}
      aria-label={active && descending !== undefined ? `${option.label ?? option.value}, ${descending ? 'high to low' : 'low to high'}` : undefined}
      onclick={() => { if (!active || descending !== undefined) onSort(option.value); }}>
      {option.label ?? option.value}{#if active && descending !== undefined}<span class="direction" aria-hidden="true">{descending ? '↓' : '↑'}</span>{/if}
     </button>
    {/each}
   </span>
  </div>
  {#if filters.length}
   <!-- Phones keep the filters behind their toggle so the first cards sit near the top. -->
   <div class="filter-panel" id="{uid}-filters" hidden={!wide && !filtersOpen}>
    <fieldset class="filters" disabled={busy}>
     <legend>{filterLegend}</legend>
     <div class="filter-options" role="group" aria-label={filterLegend}>
      {#each filters as option (option.value)}
       <button type="button" class="quiet filter" aria-pressed={filter === option.value} aria-label={option.label ?? option.value} onclick={() => { if (filter !== option.value) onFilter?.(option.value); }}>
        <span>{option.label ?? option.value}</span>{#if option.count !== undefined}<span class="filter-count">{option.count}</span>{/if}
       </button>
      {/each}
     </div>
    </fieldset>
   </div>
  {/if}
  {@render rail?.()}
 </div>
 <div class="content" id={resultsId} tabindex="-1">
  {@render children()}
 </div>
</section>

<style>
 .browser, .rail, .content { min-width: 0; }
 .content { scroll-margin-top: 72px; }
 .content:focus { outline: none; }
 .search-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-2); margin-block: var(--space-1) var(--space-2); }
 .filters-toggle { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 3rem; padding-inline: var(--space-4); }
 .filters-badge { padding: .1rem .4rem; border-radius: 999px; background: var(--text); color: var(--background); font-size: var(--text-xs); font-weight: 750; }
 .filter-panel { margin-bottom: var(--space-2); }
 .filter-panel[hidden] { display: none; }
 legend { font-size: var(--text-sm); font-weight: 650; }
 input[type='search'] { width: 100%; min-width: 0; min-height: 3rem; }
 fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
 legend { margin-bottom: var(--space-2); }
 .filter-options { display: flex; flex-wrap: wrap; gap: var(--space-2); }
 .filter { display: inline-flex; align-items: baseline; gap: .35rem; min-width: 2.75rem; min-height: 2.75rem; padding: var(--space-2) var(--space-3); border: 1px solid var(--border); text-align: left; }
 .filter-count { color: var(--muted); font-size: var(--text-xs); font-variant-numeric: tabular-nums; }
 .filter[aria-pressed='true'] { color: var(--background); border-color: var(--text); background: var(--text); }
 .filter[aria-pressed='true'] .filter-count { color: inherit; }
 .search-field { position: relative; display: block; min-width: 0; }
 .search-field input { padding-right: 2.75rem; }
 .search-field input::-webkit-search-cancel-button { display: none; }
 .clear-search { position: absolute; top: 50%; right: 2px; translate: 0 -50%; width: 2.75rem; padding: 0; color: var(--muted); font-size: 1.4rem; line-height: 1; }
 .sort-row { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-2); font-size: var(--text-sm); }
 .sort-label { color: var(--muted); font-weight: 650; white-space: nowrap; }
 .sort-options { display: flex; flex: 1; gap: 3px; padding: 2px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--background); }
 .sort-options button { flex: 1; min-height: 2.5rem; padding: 0 var(--space-3); border: 0; background: transparent; color: var(--muted); font-size: var(--text-base); }
 .sort-options button[aria-pressed='true'] { background: var(--text); color: var(--background); }
 .direction { margin-left: .25em; }
 @media (min-width: 48rem) {
  .wide { display: grid; grid-template-columns: 132px minmax(0, 1fr); gap: 28px; align-items: start; }
  .wide .rail { position: sticky; top: 72px; max-height: calc(100dvh - 88px); overflow-y: auto; overscroll-behavior: contain; padding: 0 .25rem .25rem; }
  .wide .filter-options { display: grid; gap: 3px; }
  .wide .filter { display: flex; justify-content: space-between; align-items: center; gap: .45rem; width: 100%; min-height: 44px; padding: 0 10px; border-radius: 4px; }
  .wide .search-row { grid-template-columns: minmax(0, 1fr); margin-block: 0 20px; }
  .wide .sort-row { display: grid; gap: var(--space-2); margin-bottom: 20px; }
  .wide .sort-options.stacked { flex-direction: column; }
  .wide .sort-options button { padding-inline: var(--space-1); font-size: var(--text-sm); }
 }
</style>
