import { defineConfig } from '@playwright/test';

const port = Number(process.env.STORYBOOK_TEST_PORT ?? 6006);
const agentationPort = Number(process.env.AGENTATION_TEST_PORT ?? 4748);

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
	webServer: [
		{
			command: `AGENTATION_STORE=memory npx --no-install agentation-mcp server --host 127.0.0.1 --port ${agentationPort}`,
			url: `http://127.0.0.1:${agentationPort}/health`,
			reuseExistingServer: false,
			timeout: 120000
		},
		{
			command: `npm run storybook -- --ci --port ${port}`,
			port,
			reuseExistingServer: false,
			timeout: 120000,
			env: {
				VITE_AGENTATION_ENDPOINT: `http://127.0.0.1:${agentationPort}`
			}
		}
	]
});
