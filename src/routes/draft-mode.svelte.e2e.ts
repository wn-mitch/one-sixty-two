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

test('a Draft Mode run goes from franchise to played nine-game stops and resumes after a reload', async ({ page }) => {
 await page.goto('/draft?developer=on');
 // A franchise's package is explained before the run starts.
 await page.locator('label.franchise', { hasText: 'Atlanta Braves' }).click();
 await expect(page.locator('.package')).toContainText('The Cherokee Commute. A sweetheart stadium deal pays for a salary cap 15% above the table.');
 await page.locator('label.franchise', { hasText: 'Seattle Mariners' }).click();
 await expect(page.locator('.package')).toHaveText('An ordinary franchise: the table cap and standard training.');
 await page.getByRole('button', { name: 'Start draft' }).click();
 // The commissioner's opening decree is known before the first pick and still in force at the window.
 const opening = page.getByRole('complementary', { name: /^Opening decree: / });
 await expect(opening).toBeVisible();
 const decree = (await opening.getAttribute('aria-label'))!.replace('Opening decree: ', '');
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
 await expect(page.getByText(/16 of 20 cards/)).toBeVisible();
 await expect(page.getByRole('complementary', { name: `Opening decree: ${decree}` })).toBeVisible();
 // The window opens on trades and waivers; commons wait until waivers close.
 await expect(page.getByRole('button', { name: 'Auto-fix' })).toHaveCount(0);
 const desk = page.getByRole('region', { name: 'Trades' });
 await desk.getByRole('group', { name: 'Propose a trade to' }).getByRole('button').first().click();
 await desk.locator('fieldset').first().getByRole('checkbox').first().check();
 await desk.locator('fieldset').nth(1).getByRole('checkbox').last().check();
 await desk.getByRole('button', { name: 'Send offer' }).click();
 // The club answers at once, and the answer survives a reload.
 const answer = desk.getByRole('list', { name: 'Your offers' }).locator('li').first();
 await expect(answer).toContainText(/^(Accepted|Turned down|Countered) /);
 const answered = await answer.textContent();
 const wire = page.getByRole('region', { name: 'Waivers' });
 const claim = wire.getByRole('button', { name: /^Claim / }).and(page.locator(':enabled')).first();
 const claimed = await claim.count() ? await claim.getAttribute('aria-label') : null;
 if (claimed) {
  await claim.click();
  await expect(wire.getByRole('button', { name: claimed.replace(/^Claim/, 'Unclaim') })).toHaveAttribute('aria-pressed', 'true');
 }
 await page.reload();
 await expect(desk.getByRole('list', { name: 'Your offers' }).locator('li').first()).toHaveText(answered!, { timeout: 60_000 });
 if (claimed) await expect(wire.getByRole('button', { name: claimed.replace(/^Claim/, 'Unclaim') })).toHaveAttribute('aria-pressed', 'true');
 // The market fits the phone width.
 expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
 await page.getByRole('button', { name: 'Close waivers' }).click();
 await expect(page.getByRole('region', { name: 'Trades' })).toHaveCount(0);
 await page.getByRole('button', { name: 'Auto-fix' }).click();
 await expect(page.getByText('Roster is legal.')).toBeVisible();
 // The window's batting order survives a reload and opens the season.
 const batting = page.locator('[data-order-kind="batting"] > li');
 const order = () => batting.evaluateAll(rows => rows.map(row => row.getAttribute('data-season-id')));
 const drafted = await order();
 await batting.first().getByRole('button', { name: /down in batting order/ }).click();
 const moved = [drafted[1], drafted[0], ...drafted.slice(2)];
 await expect.poll(order).toEqual(moved);
 await page.reload();
 await expect(page.getByText('Roster is legal.')).toBeVisible({ timeout: 60_000 });
 expect(await order()).toEqual(moved);
 await page.getByRole('button', { name: 'Submit roster' }).click();

 await expect(page.getByRole('heading', { name: 'Opening day' })).toBeVisible();
 expect(await order()).toEqual(moved);
 await page.getByRole('button', { name: 'Play games 1–9' }).click();
 // The segment plays on the season broadcast, then returns to the next stop.
 await expect(page.getByRole('heading', { name: 'Playing games 1–9' })).toBeVisible();
 await expect(page.getByRole('heading', { name: 'After game 9' })).toBeVisible({ timeout: 120_000 });
 const standings = page.getByRole('region', { name: 'Standings' });
 const games = await standings.locator('tbody tr').evaluateAll(rows => rows.map(row => Number(row.children[1].textContent) + Number(row.children[2].textContent)));
 expect(games).toEqual(Array(8).fill(9));
 // The first payday is credited and banked, and the bank survives the reload below.
 const crowd = page.getByRole('region', { name: 'Crowd and cash' });
 const payday = Number((await crowd.locator('dt:text-is("Payday") + dd').textContent())!.match(/^\+(\d+)/)![1]);
 expect(payday).toBeGreaterThan(0);
 await expect(crowd.locator('dt:text-is("Bank") + dd')).toHaveText(String(payday));
 // A hitting lesson spends 10 from the bank, marks the card trained, and survives the reload below.
 const shop = page.getByRole('region', { name: 'Training' });
 await shop.getByRole('radio', { name: /^Hitting/ }).click();
 const lesson = shop.getByRole('button', { name: /^Train / }).first();
 const trainee = (await lesson.getAttribute('aria-label'))!.replace(/^Train (.*): Hitting$/, '$1');
 await lesson.click();
 await expect(shop.locator('.bank strong')).toHaveText(String(payday - 10));
 await expect(shop.getByRole('button', { name: `Train ${trainee}: Hitting` })).toHaveText('Trained');
 await expect(page.getByLabel('1 lasting training')).toHaveCount(1);
 // A push states its risk and the backup before it is taken, and stays on through the reload below.
 const pushes = page.getByRole('list', { name: 'Pushes' });
 const ride = pushes.getByRole('button', { name: /^Take ride the starter for / }).first();
 await expect(pushes.locator('li').first()).toContainText(/13% injury risk; if hurt, .+ would play SP/);
 const ridden = (await ride.getAttribute('aria-label'))!.replace('Take ride the starter for ', '');
 await ride.click();
 await expect(pushes.getByRole('button', { name: `Call off ride the starter for ${ridden}` })).toBeVisible();

 // A reserve change is kept with the season and survives a reload.
 const reserves = page.getByRole('region', { name: 'Reserves' });
 const firstReserve = reserves.locator('li[data-season-id]').first();
 const before = await firstReserve.getAttribute('data-season-id');
 await reserves.getByLabel(/^Position for /).first().selectOption({ index: 1 });
 await expect(firstReserve).not.toHaveAttribute('data-season-id', before!);
 const benched = await firstReserve.getAttribute('data-season-id');
 await page.reload();
 await expect(page.getByRole('heading', { name: 'After game 9' })).toBeVisible({ timeout: 60_000 });
 await expect(firstReserve).toHaveAttribute('data-season-id', benched!);
 await expect(crowd.locator('dt:text-is("Bank") + dd')).toHaveText(String(payday - 10));
 await expect(page.getByLabel('1 lasting training')).toHaveCount(1);
 await expect(pushes.getByRole('button', { name: `Call off ride the starter for ${ridden}` })).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);

 // Completed reports stay in history; starting again from one clears its URL selection.
 for (let segment = 2; segment <= 18; segment++) {
  await page.getByRole('button', { name: `Play games ${segment * 9 - 8}–${segment * 9}`, exact: true }).click();
  if (segment === 18) break;
  if (segment % 3 === 0) {
   // A chapter stop opens the market first: the condition and pack, then waivers, then submission.
   await expect(page.getByRole('heading', { name: `Chapter ${segment / 3} market` })).toBeVisible({ timeout: 120_000 });
   if (segment === 3) {
    await expect(page.getByRole('list', { name: 'Pack cards' }).locator('li')).toHaveCount(4);
    // The next chapter's decree is revealed before any spending, and never repeats the last.
    const incoming = page.getByRole('complementary', { name: /^Chapter 2 decree: / });
    await expect(incoming).toBeVisible();
    await expect(incoming).not.toHaveAttribute('aria-label', `Chapter 2 decree: ${decree}`);
   }
   await page.getByRole('button', { name: 'Close waivers' }).click();
   await page.getByRole('button', { name: 'Auto-fix' }).click();
   await expect(page.getByText('Roster is legal.')).toBeVisible({ timeout: 60_000 });
   await page.getByRole('button', { name: 'Submit roster' }).click();
  }
  const title = segment % 3 === 0 ? `Chapter ${segment / 3} complete` : `After game ${segment * 9}`;
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole('complementary', { name: /^Decree in force: / })).toBeVisible();
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
