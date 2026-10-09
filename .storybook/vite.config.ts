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
		alias: [{ find: /^#lib[/]/, replacement: fileURLToPath(new URL('../src/lib/', import.meta.url)) }]
	}
});
