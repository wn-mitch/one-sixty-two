import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/sveltekit';
import { mergeConfig, type Plugin } from 'vite';

const contactModelPath = fileURLToPath(new URL('../scripts/data/contact-model.ts', import.meta.url));

/** Shared sim fixtures load the contact model from disk; the browser receives the same model as static data. */
function contactModelData(): Plugin {
	return {
		name: 'storybook-contact-model',
		enforce: 'pre',
		async load(id) {
			if (id.split('?')[0] !== contactModelPath) return null;
			const { loadContactModel } = (await import(contactModelPath)) as typeof import('../scripts/data/contact-model.ts');
			return `const model = ${JSON.stringify(loadContactModel())};\nexport function loadContactModel() { return model; }\n`;
		}
	};
}

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
			plugins: [contactModelData()],
			server: { watch: { ignored: /(?:^|[/\\])\.cache(?:[/\\]|$)/ } }
		});
	}
};

export default config;
