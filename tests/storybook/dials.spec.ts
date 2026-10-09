import { expect, openStoryByName, test } from './workshop-test.ts';

const storageKeys = ['162-zero:v1', '162-zero:settings:v1'];

test('previews card width, finish, and reverse text without changing game or motion storage', async ({ page }) => {
 await openStoryByName(page, 'Cards/States', 'Interactive');
 const stored = await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), storageKeys);
 const root = page.locator('.dialkit-root');
 await root.getByRole('button', { name: 'DialKit', exact: true }).click();
 const width = root.getByRole('slider', { name: 'Width', exact: true });
 await width.focus();
 await width.press('End');
 const front = page.locator('.card-review .front .card');
 await expect(front).toHaveJSProperty('clientWidth', 410);
 await root.getByRole('button', { name: /^Finish / }).click();
 await page.getByRole('listbox', { name: 'Finish', exact: true }).getByRole('option', { name: 'Gem', exact: true }).click();
 await expect(front).toHaveAttribute('data-finish', 'gem');
 await root.getByRole('radiogroup', { name: 'Text Back', exact: true }).getByRole('radio', { name: 'On', exact: true }).click();
 await expect(page.locator('.card-review [data-cardbox]')).toHaveAttribute('data-face', 'back');
 await expect(page.locator('.card-review .back .inspection-back.simplified')).toBeVisible();
 await expect(front).toHaveAttribute('data-finish', 'gem');
 await root.getByRole('button', { name: 'DialKit', exact: true }).click();
 await page.getByRole('button', { name: 'Reset story', exact: true }).click();
 await expect(page.locator('.card-review [data-cardbox]')).toHaveAttribute('data-face', 'front');
 await expect(front).toHaveJSProperty('clientWidth', 280);
 await expect(front).toHaveAttribute('data-finish', 'base');
 expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), storageKeys)).toEqual(stored);
});

test('unregisters old panels and restores declared story values after navigation and Reset', async ({ page }) => {
 await openStoryByName(page, 'Cards/States', 'Interactive');
 const root = page.locator('.dialkit-root');
 await root.getByRole('button', { name: 'DialKit', exact: true }).click();
 await root.getByRole('slider', { name: 'Width', exact: true }).press('End');
 await openStoryByName(page, 'Application/Welcome', 'Start');
 await root.getByRole('button', { name: 'DialKit', exact: true }).click();
 await expect(root.getByRole('button', { name: 'Card preview', exact: true })).toHaveCount(0);
 await expect(root.getByRole('button', { name: 'Home showcase', exact: true })).toBeVisible();
 await openStoryByName(page, 'Interactions/Cards', 'Text back');
 await expect(page.locator('.card-review .back .inspection-back.simplified')).toBeVisible();
 await expect(page.locator('.card-review .review-artwork .cardbox')).toHaveAttribute('data-face', 'back');
 await page.getByRole('button', { name: 'Text version', exact: true }).click();
 await expect(page.locator('.card-review .back .card[data-face="back"]')).toBeVisible();
 await page.getByRole('button', { name: 'Reset story', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Text version', exact: true })).toHaveAttribute('aria-pressed', 'true');
 await expect(page.locator('.card-review .back .inspection-back.simplified')).toBeVisible();
 await openStoryByName(page, 'Cards/States', 'Interactive');
 await expect(page.locator('.card-review .front .card')).toHaveJSProperty('clientWidth', 280);
 await root.getByRole('button', { name: 'DialKit', exact: true }).click();
 await expect(root.getByRole('button', { name: 'Home showcase', exact: true })).toHaveCount(0);
 await expect(root.getByRole('slider', { name: 'Width', exact: true })).toHaveAttribute('aria-valuenow', '280');
});
