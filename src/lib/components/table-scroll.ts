import type { Action } from 'svelte/action';

/** Keeps a scroll region in the tab order only while it has horizontal overflow. */
export const tableScroll: Action<HTMLElement> = node => {
	const originalTabIndex = node.getAttribute('tabindex');
	const table = node.querySelector('table');

	function update(): void {
		if (node.scrollWidth > node.clientWidth) node.tabIndex = 0;
		else node.removeAttribute('tabindex');
	}

	const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
	observer?.observe(node);
	if (table) observer?.observe(table);
	update();

	return {
		destroy() {
			observer?.disconnect();
			if (originalTabIndex === null) node.removeAttribute('tabindex');
			else node.setAttribute('tabindex', originalTabIndex);
		}
	};
};
