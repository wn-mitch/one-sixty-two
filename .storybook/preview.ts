import type { Preview } from '@storybook/sveltekit';
import { mount, unmount } from 'svelte';
import { loadEngine } from '../src/lib/engine/browser.ts';
import { configureMediaLoader, type MediaFixtureMode } from '../src/lib/storybook/media-fixtures.ts';
import FeedbackTools from '../src/lib/dev/FeedbackTools.svelte';
import Toaster from '../src/lib/components/Toaster.svelte';
import { toasts } from '../src/lib/toast.svelte.ts';
import '../src/routes/layout.css';
import '../src/lib/cards/fonts.css';

const preview: Preview = {
	// Example seasons and series run the wasm engine, which must be instantiated before any story renders.
	loaders: [async () => { await loadEngine(); return {}; }],
	async beforeEach({ id, parameters }) {
		const mediaController = configureMediaLoader((parameters.mediaState ?? 'ready') as MediaFixtureMode);
		let feedbackHost: HTMLDivElement | null = null;
		let feedbackTools: Record<string, unknown> | null = null;
		let toaster: Record<string, unknown> | null = null;
		const toasterHost = document.createElement('div');

		try {
			location.hash = `story=${encodeURIComponent(id)}`;
			feedbackHost = document.createElement('div');
			feedbackHost.dataset.storybookFeedbackHost = '';
			document.body.append(feedbackHost);
			// The application layout owns the toaster; stories mount their own so action feedback is visible.
			document.body.append(toasterHost);
			toaster = mount(Toaster, { target: toasterHost });
			feedbackTools = mount(FeedbackTools, {
				target: feedbackHost,
				props: {
					useHashLocation: true,
					dialProductionEnabled: true,
					appName: '162-0 Storybook'
				}
			});
		} catch (error) {
			mediaController.dispose();
			feedbackHost?.remove();
			toasterHost.remove();
			throw error;
		}

		return async () => {
			try {
				if (feedbackTools) await unmount(feedbackTools);
				if (toaster) await unmount(toaster);
			} finally {
				for (const item of toasts.items) toasts.dismiss(item.key);
				feedbackHost?.remove();
				toasterHost.remove();
				mediaController.dispose();
			}
		};
	},
	parameters: {
		options: {
			storySort: { order: ['Application', 'Cards', ['Eras', 'States', 'Motion'], 'Interactions', 'Draft', 'Lineup', 'Simulation', 'Results', 'Media'] }
		},
		layout: 'fullscreen',
		viewport: {
			options: {
				phone: { name: 'Phone', styles: { width: '402px', height: '874px' } },
				smallPhone: { name: 'Small phone', styles: { width: '320px', height: '568px' } },
				tablet: { name: 'Tablet', styles: { width: '820px', height: '1180px' } },
				landscape: { name: 'Landscape', styles: { width: '1024px', height: '768px' } },
				desktop: { name: 'Desktop', styles: { width: '1440px', height: '900px' } }
			}
		}
	}
};

export default preview;
