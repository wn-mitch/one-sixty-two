import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4162);

export default defineConfig({
	// The suite runs against local workerd with local R2.
	webServer: {
		command:
			'node scripts/test-build.ts && node scripts/test-server.ts',
		port,
		// Includes preparing and hashing the reviewed portrait inventory.
		timeout: 600000,
		reuseExistingServer: false
	},
	use: { baseURL: `http://127.0.0.1:${port}`, headless: true },
	// One local workerd serves every parallel browser; first loads outlast the 5 s default under a full run.
	expect: { timeout: 15_000 },
	testMatch: '**/*.e2e.{ts,js}',
	// Agent worktrees under .claude/ hold their own copies of every test.
	testIgnore: '**/.claude/**'
});
