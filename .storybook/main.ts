import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/sveltekit';

const config: StorybookConfig = {
	framework: {
		name: '@storybook/sveltekit',
		options: {
			builder: { viteConfigPath: fileURLToPath(new URL('./vite.config.ts', import.meta.url)) }
		}
	},
	stories: ['../src/lib/storybook/**/*.stories.svelte'],
	addons: ['@storybook/addon-svelte-csf'],
	staticDirs: ['../static']
};

export default config;
