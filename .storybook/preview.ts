import type { Preview } from '@storybook/sveltekit';
import { mount, unmount } from 'svelte';
import { configureMediaLoader, type MediaFixtureMode } from '../src/lib/storybook/media-fixtures.ts';
import FeedbackTools from '../src/lib/dev/FeedbackTools.svelte';
import '../src/routes/layout.css';
import '../src/lib/cards/fonts.css';

const preview: Preview = {
	async beforeEach({ id, parameters }) {
		const mediaController = configureMediaLoader((parameters.mediaState ?? 'ready') as MediaFixtureMode);
		let feedbackHost: HTMLDivElement | null = null;
		let feedbackTools: Record<string, unknown> | null = null;

		try {
			location.hash = `story=${encodeURIComponent(id)}`;
			feedbackHost = document.createElement('div');
			feedbackHost.dataset.storybookFeedbackHost = '';
			document.body.append(feedbackHost);
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
			throw error;
		}

		return async () => {
			try {
				if (feedbackTools) await unmount(feedbackTools);
			} finally {
				feedbackHost?.remove();
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
