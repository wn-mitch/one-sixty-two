import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(240_000);

test('a Draft Mode run goes from franchise to a played chapter and resumes after a reload', async ({ page }) => {
 await page.goto('/draft');
 await page.locator('label.franchise', { hasText: 'Seattle Mariners' }).click();
 await page.getByRole('button', { name: 'Start draft' }).click();
 for (let pick = 1; pick <= 16; pick++) {
  await expect(page.getByRole('heading', { name: `Pick ${pick} of 16` })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Pick', exact: true }).first().click();
 }
 await expect(page.getByRole('heading', { name: 'Opening window' })).toBeVisible();
 // Sixteen picks leave four open places, so the roster is not yet legal.
 await expect(page.getByRole('button', { name: 'Submit roster' })).toBeDisabled();
 await expect(page.getByText(/16 of 20 cards/)).toBeVisible();
 await page.getByRole('button', { name: 'Auto-fix' }).click();
 await expect(page.getByText('Roster is legal.')).toBeVisible();
 await page.getByRole('button', { name: 'Submit roster' }).click();

 await expect(page.getByRole('heading', { name: 'Opening day' })).toBeVisible();
 await page.getByRole('button', { name: 'Play chapter 1' }).click();
 await expect(page.getByRole('heading', { name: 'After chapter 1 of 6' })).toBeVisible({ timeout: 120_000 });
 const standings = page.getByRole('region', { name: 'Standings' });
 const games = await standings.locator('tbody tr').evaluateAll(rows => rows.map(row => Number(row.children[1].textContent) + Number(row.children[2].textContent)));
 expect(games).toEqual(Array(8).fill(27));

 // A reserve change is kept with the season and survives a reload.
 // The name and year identify the card; the form line beside it changes with the season.
 const firstReserve = page.getByRole('region', { name: 'Reserves' }).locator('li .who .name > span').first();
 const before = await firstReserve.innerText();
 await page.getByLabel(/^Bring /).first().selectOption({ index: 1 });
 await expect(firstReserve).not.toHaveText(before);
 const benched = await firstReserve.innerText();
 await page.reload();
 await expect(page.getByRole('heading', { name: 'After chapter 1 of 6' })).toBeVisible({ timeout: 60_000 });
 await expect(firstReserve).toHaveText(benched);
 expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

 // Completed reports stay in history; starting again from one clears its URL selection.
 for (let chapter = 2; chapter <= 6; chapter++) {
  await page.getByRole('button', { name: `Play chapter ${chapter}`, exact: true }).click();
  if (chapter < 6) await expect(page.getByRole('heading', { name: `After chapter ${chapter} of 6` })).toBeVisible({ timeout: 120_000 });
 }
 await expect(page.getByRole('heading', { name: 'Final standings' })).toBeVisible({ timeout: 120_000 });
 await expect(page.getByRole('link', { name: 'Shop: 1 unlock token', exact: true })).toBeVisible();
 await page.goto('/shop');
 await expect(page.locator('.balance')).toHaveText('1 unlock token');
 await page.goto('/draft');
 await expect(page.getByRole('button', { name: 'Start draft', exact: true })).toBeVisible();
 await page.goto('/seasons');
 await page.getByRole('link', { name: /^Full season results for / }).click();
 await expect(page).toHaveURL(/\/draft\?run=/);
 await expect(page.getByRole('heading', { name: 'Final standings' })).toBeVisible({ timeout: 60_000 });
 await page.locator('.scoreboard').getByRole('button', { name: 'New draft', exact: true }).click();
 await expect(page).toHaveURL(/\/draft$/);
 await page.locator('label.franchise', { hasText: 'Seattle Mariners' }).click();
 await page.getByRole('button', { name: 'Start draft', exact: true }).click();
 await page.getByRole('button', { name: 'Pick', exact: true }).first().click();
 await expect(page.getByRole('heading', { name: 'Pick 2 of 16' })).toBeVisible({ timeout: 60_000 });
 await page.reload();
 await expect(page.getByRole('heading', { name: 'Pick 2 of 16' })).toBeVisible({ timeout: 60_000 });
});
