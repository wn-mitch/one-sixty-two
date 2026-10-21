<script lang="ts">
	import { onMount } from 'svelte';
	import { deviceDb } from '#lib/storage/db.ts';
	import { saveBoardName, savedBoardName } from '#lib/game/standings.ts';

	/**
	 * The board name sent with every daily from this device. Today's run picks it up the next time its standing
	 * loads, if it has no accepted name yet. The server checks it on each submission.
	 */
	const uid = $props.id();
	let draft = $state('');
	let saved = $state<string | null>(null);
	let ready = $state(false);
	let note = $state('');

	onMount(() => {
		void deviceDb().then(({ db }) => savedBoardName(db)).then(name => { saved = name; draft = name ?? ''; ready = true; })
			.catch(() => { note = 'Device storage is unavailable, so a board name cannot be saved.'; });
	});

	async function save(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const next = draft.trim() || null;
		if (!ready || next === saved) return;
		try {
			await saveBoardName((await deviceDb()).db, next);
			saved = next;
			note = next ? `Saved. Your dailies go on the board as ${next}.` : 'Cleared. Your dailies go on the board as Anonymous.';
		} catch { note = 'The name could not be saved. Please retry.'; }
	}
</script>

<form class="board-name-setting" onsubmit={save}>
	<label for={`${uid}-name`}>Daily board name</label>
	<p id={`${uid}-hint`}>Sent with every daily you finish. Leave blank to stay Anonymous. <a href="/conduct">Name rules</a></p>
	<div class="name-row">
		<input id={`${uid}-name`} maxlength="20" autocomplete="nickname" spellcheck="false" placeholder="Anonymous" bind:value={draft}
			disabled={!ready} aria-describedby={`${uid}-hint ${uid}-note`} />
		<button class="secondary" type="submit" disabled={!ready || (draft.trim() || null) === saved}>Save</button>
	</div>
	<p id={`${uid}-note`} role="status">{note}</p>
</form>

<style>
	.board-name-setting { display: grid; gap: var(--space-1); min-width: 0; }
	label { font-weight: 750; }
	p { margin: 0; color: var(--muted); font-size: var(--text-sm); }
	p:empty { display: none; }
	.name-row { display: flex; gap: var(--space-2); min-width: 0; margin-top: var(--space-1); }
	.name-row input { flex: 1 1 auto; min-width: 0; }
	.name-row button { flex: none; }
</style>
