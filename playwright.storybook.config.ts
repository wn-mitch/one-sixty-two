import { defineConfig } from '@playwright/test';

const port = Number(process.env.STORYBOOK_TEST_PORT ?? 6006);

export default defineConfig({
	testDir: './tests/storybook',
	testMatch: '**/*.spec.ts',
	fullyParallel: true,
	workers: 2,
	timeout: 45000,
	outputDir: '.cache/storybook-test-results',
	reporter: 'list',
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		headless: true,
		viewport: { width: 1440, height: 900 },
		launchOptions: { args: ['--mute-audio'] },
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
	webServer: {
		command: `npm run storybook -- --ci --port ${port}`,
		port,
		reuseExistingServer: false,
		timeout: 120000
	}
});
