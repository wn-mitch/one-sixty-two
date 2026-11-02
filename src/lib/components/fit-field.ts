/**
 * Caps the field card inside a scrolling `content` element to the height its container has left, so the whole
 * field, bullpen included, shows without scrolling. `limit` is the container's tallest allowed height; the
 * container's other children (header, footer) and the content beside the field come out of it. The card keeps
 * its aspect ratio, so capping its height caps its width (`--sheet-field-height`, Roster.svelte).
 */
export function fitField(content: HTMLElement, limit: () => number): { destroy(): void } {
	let observed: HTMLElement | null = null;
	const measure = () => {
		const field = content.querySelector<HTMLElement>('.field-card');
		if (field !== observed) {
			if (observed) resize.unobserve(observed);
			observed = field;
			if (field) resize.observe(field);
		}
		const shell = content.parentElement;
		if (!field || !shell || field.getClientRects().length === 0) {
			content.style.removeProperty('--sheet-field-height');
			return;
		}
		const chrome = shell.offsetHeight - content.clientHeight;
		const besideField = content.scrollHeight - field.offsetHeight;
		content.style.setProperty('--sheet-field-height', `${Math.max(240, Math.floor(limit() - chrome - besideField))}px`);
	};
	const resize = new ResizeObserver(measure);
	const changes = new MutationObserver(measure);
	resize.observe(content);
	for (const part of content.parentElement?.children ?? []) if (part !== content) resize.observe(part);
	changes.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
	addEventListener('resize', measure);
	measure();
	return {
		destroy() {
			resize.disconnect();
			changes.disconnect();
			removeEventListener('resize', measure);
		}
	};
}
