import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/sveltekit';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
	framework: {
		name: '@storybook/sveltekit',
		options: {
			builder: { viteConfigPath: fileURLToPath(new URL('./vite.config.ts', import.meta.url)) }
		}
	},
	stories: ['../src/lib/storybook/**/*.stories.svelte'],
	addons: ['@storybook/addon-svelte-csf'],
	staticDirs: ['../static'],
	viteFinal(viteConfig) {
		// The builder supplies server options before this hook.
		return mergeConfig(viteConfig, {
			server: { watch: { ignored: /(?:^|[/\\])\.cache(?:[/\\]|$)/ } }
		});
	}
};

export default config;
