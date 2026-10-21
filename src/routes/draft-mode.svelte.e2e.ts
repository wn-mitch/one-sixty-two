import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(240_000);

const fieldButton = (page: Page, picked: number) => page.getByRole('button', { name: `Open your field, ${picked} of 16 picked` });

/** Selects the pile's first card, places it in its first open slot (or on the bench), and drafts it. */
async function draftFirstCard(page: Page, picked: number, place: 'slot' | 'bench' = 'slot') {
 await expect(fieldButton(page, picked)).toBeVisible({ timeout: 60_000 });
 // A role query skips the aria-hidden copies the grid deals in with.
 await page.getByRole('region', { name: 'Players' }).getByRole('button', { name: /^Select / }).first().click();
 const sheet = page.locator('dialog.draft-sheet[open]');
 const confirm = sheet.locator('.pick-confirmation button.primary');
 const target = place === 'bench' ? sheet.locator('[data-bench-open]') : sheet.locator('.highlighted[data-slot], [data-bench-open]').first();
 if (place === 'bench' || await confirm.isDisabled()) await target.click();
 await confirm.click();
}

test('public visitors cannot enter unfinished Draft Mode; a developer opt-in can', async ({ page }) => {
 await page.goto('/');
 await expect(page.getByRole('link', { name: /Draft Mode/ })).toHaveCount(0);
 await page.goto('/draft');
 await expect(page.getByRole('heading', { name: 'This mode isn’t available' })).toBeVisible();
 await expect(page.locator('label.franchise')).toHaveCount(0);
 await page.getByRole('link', { name: 'Back to Play' }).click();
 await expect(page.getByRole('heading', { name: /Can you go/ })).toBeVisible();
 await page.goto('/draft?developer=on');
 await expect(page.locator('label.franchise').first()).toBeVisible({ timeout: 60_000 });
 await page.goto('/draft?developer=off');
 await expect(page.getByRole('heading', { name: 'This mode isn’t available' })).toBeVisible();
});

test('a Draft Mode run goes from franchise to a played chapter and resumes after a reload', async ({ page }) => {
 await page.goto('/draft?developer=on');
 await page.locator('label.franchise', { hasText: 'Seattle Mariners' }).click();
 await page.getByRole('button', { name: 'Start draft' }).click();
 // The seat's two sealed packs open together into the first pile.
 await page.getByRole('button', { name: 'Open your 2 packs' }).first().click();
 // The first pick goes to the bench, and a reload keeps it there.
 await draftFirstCard(page, 0, 'bench');
 const sheet = page.locator('dialog.draft-sheet[open]');
 for (const reload of [false, true]) {
  if (reload) await page.reload();
  await fieldButton(page, 1).click();
  await expect(sheet.getByRole('heading', { name: /^Bench 1 ·/ })).toBeVisible();
  await expect(sheet.locator('[data-slot]').filter({ hasText: 'Open' })).toHaveCount(18);
  await sheet.getByRole('button', { name: 'Close field' }).click();
 }
 for (let picked = 1; picked < 16; picked++) await draftFirstCard(page, picked);
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
 await expect(page.getByRole('link', { name: 'Shop, 1 token', exact: true })).toBeVisible();
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
 await page.getByRole('button', { name: 'Open your 2 packs' }).first().click();
 await draftFirstCard(page, 0);
 await expect(fieldButton(page, 1)).toBeVisible({ timeout: 60_000 });
 await page.reload();
 await expect(fieldButton(page, 1)).toBeVisible({ timeout: 60_000 });

 // New draft lives in the site menu and asks before leaving an unfinished run; Keep returns to the same pick.
 await page.getByRole('button', { name: 'Menu', exact: true }).click();
 await page.getByRole('button', { name: 'New draft', exact: true }).click();
 const confirmation = page.getByRole('dialog', { name: 'Leave this roster behind?' });
 await expect(confirmation).toContainText('moves to My teams');
 await confirmation.getByRole('button', { name: 'Keep draft' }).click();
 await expect(confirmation).toBeHidden();
 await expect(fieldButton(page, 1)).toBeVisible();
 await page.getByRole('button', { name: 'Menu', exact: true }).click();
 await page.getByRole('button', { name: 'New draft', exact: true }).click();
 await page.getByRole('dialog', { name: 'Leave this roster behind?' }).getByRole('button', { name: 'Discard and start new' }).click();
 await expect(page.getByRole('button', { name: 'Start draft', exact: true })).toBeVisible();
});
