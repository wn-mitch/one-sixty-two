import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4162);

export default defineConfig({
	// The suite runs against local workerd with local R2. The test launcher replaces
	// only BROWSER.quickAction with a loopback Playwright capture bridge.
	webServer: {
		command:
			'npm run build && node scripts/test-server.ts',
		port,
		// Includes preparing and hashing the reviewed portrait inventory.
		timeout: 600000,
		reuseExistingServer: false
	},
	use: { baseURL: `http://127.0.0.1:${port}`, headless: true },
	testMatch: '**/*.e2e.{ts,js}'
});
