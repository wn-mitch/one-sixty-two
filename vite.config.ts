import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { stageBuildAssets } from './scripts/package-assets.ts';

export default defineConfig(async ({ command }) => ({
	server: {
		// Generated datasets and acquisition caches are runtime inputs, not browser source modules.
		watch: {
			ignored: ['**/.cache/**', '**/static/data/**', '**/static/media/**', '**/static/rankings/**']
		}
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			files: { assets: command === 'build' ? await stageBuildAssets(process.cwd()) : 'static' },
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter()
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
}));
