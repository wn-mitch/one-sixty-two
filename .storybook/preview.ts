import type { Preview } from '@storybook/sveltekit';
import { sb } from 'storybook/test';
import { configureMediaLoader, type MediaFixtureMode } from '../src/lib/storybook/media-fixtures.ts';
import '../src/routes/layout.css';
import '../src/lib/cards/fonts.css';

sb.mock(import('../src/lib/media/client.ts'), { spy: true });

const preview: Preview = {
	beforeEach({ parameters }) {
		const controller = configureMediaLoader((parameters.mediaState ?? 'ready') as MediaFixtureMode);
		return controller.dispose;
	},
	parameters: {
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
