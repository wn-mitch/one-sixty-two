import type { Locator, Page } from '@playwright/test';
import { connectAgentationMcp } from './agentation-mcp.ts';
import type { AgentationMcpClient, PendingAnnotation } from './agentation-mcp.ts';
import { expect, openStoryByName, test } from './workshop-test.ts';

async function waitForConnectedToolbar(page: Page): Promise<void> {
	await expect(page.getByRole('button', { name: 'Start feedback mode', exact: true })).toBeVisible();
	await expect(page.locator('[title="MCP Connected"]')).toHaveCount(1, { timeout: 15000 });
}

async function addAnnotation(page: Page, target: Locator, comment: string): Promise<void> {
	await page.getByRole('button', { name: 'Start feedback mode', exact: true }).click();
	await target.click();
	const editor = page.getByPlaceholder('What should change?');
	await expect(editor).toBeVisible();
	await editor.fill(comment);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(editor).toBeHidden();
}

async function findSyncedAnnotation(
	mcp: AgentationMcpClient,
	comment: string
): Promise<PendingAnnotation> {
	let annotation: PendingAnnotation | undefined;
	await expect.poll(async () => {
		annotation = (await mcp.getAllPending()).annotations.find(entry => entry.comment === comment);
		return annotation?.comment;
	}, { timeout: 15000 }).toBe(comment);
	if (!annotation) throw new Error(`Agentation did not sync feedback: ${comment}`);
	return annotation;
}

async function exitFeedbackMode(page: Page): Promise<void> {
	const exit = page.getByRole('button', { name: 'Exit', exact: true });
	if (await exit.isVisible()) await exit.click();
}

test.describe('Agentation feedback integration', () => {
	test('syncs exact story feedback through MCP, isolates hashes, persists, and resolves only that note', async ({ page }) => {
		const mcp = await connectAgentationMcp();
		const comment = `Verify anonymous card contrast ${crypto.randomUUID()}`;
		try {
			await openStoryByName(page, 'Interactions/Cards', 'Flip');
			await waitForConnectedToolbar(page);
			const storyUrl = page.url();
			const openedUrl = new URL(page.url());
			expect(openedUrl.hash).toBe(`#story=${encodeURIComponent(openedUrl.searchParams.get('id') ?? '')}`);

			const cardHeading = page.locator('.card-review .review-header h3');
			const identity = await cardHeading.innerText();
			await addAnnotation(page, cardHeading, comment);
			const synced = await findSyncedAnnotation(mcp, comment);
			expect(synced.element).toBe(`h3 "${identity}"`);
			await expect(page.locator(synced.elementPath)).toHaveText(identity);
			expect(synced.url).toBe(storyUrl);

			await page.reload({ waitUntil: 'domcontentloaded' });
			await expect(page.getByRole('button', { name: 'Reset story', exact: true })).toBeVisible();
			await waitForConnectedToolbar(page);
			await page.getByRole('button', { name: 'Start feedback mode', exact: true }).click();
			await expect(page.getByRole('button', { name: 'Copy feedback', exact: true })).toBeEnabled();
			await exitFeedbackMode(page);

			await openStoryByName(page, 'Interactions/Cards', 'Inline review');
			await waitForConnectedToolbar(page);
			await page.getByRole('button', { name: 'Start feedback mode', exact: true }).click();
			await expect(page.getByRole('button', { name: 'Copy feedback', exact: true })).toBeDisabled();
			await exitFeedbackMode(page);

			await openStoryByName(page, 'Interactions/Cards', 'Flip');
			await waitForConnectedToolbar(page);
			await page.getByRole('button', { name: 'Start feedback mode', exact: true }).click();
			const copy = page.getByRole('button', { name: 'Copy feedback', exact: true });
			await expect(copy).toBeEnabled();

			await mcp.resolve(synced.id);
			await exitFeedbackMode(page);
			await expect(page.getByRole('button', { name: 'Start feedback mode', exact: true })).toBeVisible({ timeout: 15000 });
			await page.getByRole('button', { name: 'Start feedback mode', exact: true }).click();
			await expect(copy).toBeDisabled({ timeout: 15000 });
			await expect.poll(async () =>
				(await mcp.getAllPending()).annotations.some(entry => entry.id === synced.id)
			).toBe(false);
		} finally {
			await mcp.close();
		}
	});

	test('keeps feedback tools inside the field sheet across relocation', async ({ page }) => {
		const mcp = await connectAgentationMcp();
		const comment = `Review anonymous roster card ${crypto.randomUUID()}`;
		try {
			await page.setViewportSize({ width: 402, height: 874 });
			await openStoryByName(page, 'Interactions/Draft', 'Roster review');
			await waitForConnectedToolbar(page);
			const storyHash = new URL(page.url()).hash;

			let sheet = page.getByRole('dialog', { name: 'Your field', exact: true });
			await expect(sheet).toBeVisible();
			await expect(sheet.locator('agentation-toolbar')).toHaveCount(1);
			await expect(page.locator('agentation-toolbar')).toHaveCount(1);
			await expect(sheet.locator('[data-feedback-dial-host="inline"]')).toHaveCount(1);
			await expect(page.locator('.dialkit-root')).toHaveCount(0);


			const raisedReview = sheet.locator('.card-review.raised-only');
			await raisedReview.getByRole('button', { name: 'Turn over', exact: true }).click();
			await expect(raisedReview.locator('[data-cardbox]')).toHaveAttribute('data-face', 'back');
			await sheet.getByRole('button', { name: /^Show text version for / }).click();
			const textBack = sheet.getByRole('button', { name: 'Text version', exact: true });
			await addAnnotation(page, textBack, comment);
			expect(await sheet.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
			const synced = await findSyncedAnnotation(mcp, comment);
			expect(synced.element).toBe('button "Text version"');
			expect(synced.url).toBe(page.url());

			await exitFeedbackMode(page);
			// The raised reader covers the sheet header until it is put down.
			await page.keyboard.press('Escape');
			await expect(page.locator('[data-card-reader]:popover-open')).toHaveCount(0);
			await expect(sheet).toBeVisible();
			await sheet.getByRole('button', { name: 'Close field', exact: true }).click();
			await expect(sheet).toBeHidden();
			await expect(page.locator('[data-feedback-dial-host="inline"]')).toHaveCount(0);
			await expect(page.locator('.dialkit-root')).toHaveCount(0);

			await page.getByRole('button', { name: /Open your field/ }).click();
			sheet = page.getByRole('dialog', { name: 'Your field', exact: true });
			await expect(sheet).toBeVisible();
			await expect(sheet.locator('agentation-toolbar')).toHaveCount(1);
			await expect(page.locator('agentation-toolbar')).toHaveCount(1);
			await expect(sheet.locator('[data-feedback-dial-host="inline"]')).toHaveCount(1);
			await expect(page.locator('.dialkit-root')).toHaveCount(0);
			expect(new URL(page.url()).hash).toBe(storyHash);
			expect((await mcp.getAllPending()).annotations.some(entry => entry.id === synced.id)).toBe(true);

			await page.getByRole('button', { name: 'Start feedback mode', exact: true }).click();
			const copy = page.getByRole('button', { name: 'Copy feedback', exact: true });
			await expect(copy).toBeEnabled();
			await mcp.resolve(synced.id);
			await exitFeedbackMode(page);
			await expect(page.getByRole('button', { name: 'Start feedback mode', exact: true })).toBeVisible({ timeout: 15000 });
			await page.getByRole('button', { name: 'Start feedback mode', exact: true }).click();
			await expect(copy).toBeDisabled({ timeout: 15000 });
			await expect.poll(async () =>
				(await mcp.getAllPending()).annotations.some(entry => entry.id === synced.id)
			).toBe(false);
		} finally {
			await mcp.close();
		}
	});

	test('retains local feedback and Copy while the configured endpoint is unavailable', async ({ page }) => {
		await page.route('http://127.0.0.1:4748/**', route => route.abort('connectionfailed'));
		await openStoryByName(page, 'Interactions/Cards', 'Flip');
		await expect(page.getByRole('button', { name: 'Start feedback mode', exact: true })).toBeVisible();

		const comment = `Keep local anonymous feedback ${crypto.randomUUID()}`;
		await addAnnotation(
			page,
			page.locator('.card-review .review-header h3'),
			comment
		);
		const copy = page.getByRole('button', { name: 'Copy feedback', exact: true });
		await expect(copy).toBeEnabled();
		await copy.click();
		await expect(copy).toBeEnabled();

		await page.locator('agentation-toolbar').getByRole('button', { name: 'Settings', exact: true }).click();
		await page.getByRole('button', { name: 'Manage MCP & Webhooks', exact: true }).click();
		await expect(page.locator('[title="Disconnected"]')).toHaveCount(1, { timeout: 15000 });
		await page.reload({ waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('button', { name: 'Reset story', exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Start feedback mode', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Copy feedback', exact: true })).toBeEnabled();
	});
});
