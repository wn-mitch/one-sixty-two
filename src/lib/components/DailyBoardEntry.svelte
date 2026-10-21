<script lang="ts">
	import { BOARD_SIZE, type DailyStandingsView, type NameRefusal } from '../game/standings.ts';

	/**
	 * This device's run on the day's named board: its place once verified, a note while a top run waits for its
	 * check, the optional board name, and the link to the board. A name can be added while the day is live and
	 * the run has none accepted yet.
	 */
	let { standings, onName }: { standings: DailyStandingsView; onName: (name: string) => Promise<void> } = $props();
	let draft = $state('');
	let busy = $state(false);
	let error = $state('');
	const place = $derived(standings.entry ? standings.board.findIndex(row => row.entry === standings.entry) + 1 : 0);
	const waiting = $derived(!place && !standings.final && standings.standing.rank <= BOARD_SIZE);
	const REFUSALS: Record<NameRefusal, string> = {
		length: 'Names are 3 to 20 characters.',
		characters: 'Use letters, numbers, spaces and . \' _ - only.',
		link: 'Names cannot look like a link or an email address.',
		blocked: 'It matches a filtered word or the game’s or studio’s name.'
	};

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (busy || !draft.trim()) return;
		busy = true;
		error = '';
		try { await onName(draft); }
		catch { error = 'The name could not be sent. Please retry.'; }
		finally { busy = false; }
	}
</script>

<section class="board-entry" aria-label="Today’s daily board">
	<!-- The board link shares the placement line, so the section stays short on a phone. -->
	<p class="placement">
		{#if place}<span><strong>#{place} on the {standings.final ? '' : 'day’s '}board</strong>{#if standings.name}{' '}as {standings.name}{/if}</span>
		{:else if waiting}<span>In today’s top {BOARD_SIZE}. It joins the board once it is checked.</span>{/if}
		<a class="board-link" href={`/daily/${standings.date}`}>See the {standings.final ? '' : 'day’s '}board</a>
	</p>
	{#if standings.name}
		{#if !place}<p class="muted">Board name: {standings.name}</p>{/if}
	{:else if !standings.final}
		<form class="name-form" onsubmit={submit}>
			<label for="board-name">Board name <span class="muted">(optional)</span></label>
			<div class="name-row">
				<input id="board-name" maxlength="20" autocomplete="nickname" spellcheck="false" placeholder="Anonymous" bind:value={draft} disabled={busy}
					aria-invalid={standings.nameRefusal ? 'true' : undefined} aria-describedby={standings.nameRefusal || error ? 'board-name-note' : undefined} />
				<button class="secondary" type="submit" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Add name'}</button>
			</div>
			{#if error}
				<p id="board-name-note" class="field-error" role="alert">{error}</p>
			{:else if standings.nameRefusal}
				<p id="board-name-note" class="field-error" role="alert">That name was not accepted: {REFUSALS[standings.nameRefusal]} Your run is listed as Anonymous until another is. <a href="/conduct">Name rules</a></p>
			{/if}
		</form>
	{/if}
</section>

<style>
	.board-entry { display: grid; gap: var(--space-2); min-width: 0; font-size: var(--text-sm); }
	p { margin: 0; }
	strong { font-weight: 750; }
	.name-form { display: grid; gap: var(--space-1); min-width: 0; }
	.name-row { display: flex; gap: var(--space-2); min-width: 0; }
	.name-row input { flex: 1 1 auto; min-width: 0; }
	.name-row button { flex: none; }
	.field-error { color: var(--error); }
	.placement { display: flex; flex-wrap: wrap; align-items: center; column-gap: var(--space-4); }
	.board-link { display: inline-flex; min-height: 2.75rem; align-items: center; color: var(--text); font-weight: 650; }
</style>
