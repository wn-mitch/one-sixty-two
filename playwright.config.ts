import { defineConfig } from '@playwright/test';

export default defineConfig({
	// The end-to-end suite runs against the real Worker on local workerd, so server
	// routes and the R2 replay binding are exercised for real rather than mocked.
	webServer: {
		command:
			'npm run build && npx wrangler dev --port 4162 --ip 127.0.0.1 --local --show-interactive-dev-session=false',
		port: 4162,
		// Includes preparing and hashing the reviewed portrait inventory.
		timeout: 600000,
		reuseExistingServer: false
	},
	use: { baseURL: 'http://127.0.0.1:4162', headless: true },
	testMatch: '**/*.e2e.{ts,js}'
});
