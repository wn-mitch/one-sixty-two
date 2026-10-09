import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	plugins: [tailwindcss(), svelte({
		compilerOptions: {
			runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
		}
	})],
	resolve: {
		alias: [
			// Plain selector exports keep the full media index out of Storybook's interaction log.
			{ find: /^(?:#lib\/media\/client\.ts|.*\/media\/client\.ts)$/, replacement: fileURLToPath(new URL('../src/lib/media/__mocks__/client.ts', import.meta.url)) },
			{ find: /^#lib[/]/, replacement: fileURLToPath(new URL('../src/lib/', import.meta.url)) }
		]
	}
});
