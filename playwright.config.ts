import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4162);

export default defineConfig({
	// The end-to-end suite runs against the real Worker on local workerd, so server
	// routes and the R2 replay binding are exercised for real rather than mocked.
	webServer: {
		command:
			`npm run build && npx wrangler dev --port ${port} --ip 127.0.0.1 --local --show-interactive-dev-session=false`,
		port,
		// Includes preparing and hashing the reviewed portrait inventory.
		timeout: 600000,
		reuseExistingServer: false
	},
	use: { baseURL: `http://127.0.0.1:${port}`, headless: true },
	testMatch: '**/*.e2e.{ts,js}'
});
