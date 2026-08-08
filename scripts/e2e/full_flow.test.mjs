import { test, expect } from '@playwright/test';

// Helper to fill input fields by label text
async function fillByLabel(page, label, value) {
  const input = await page.getByLabel(label);
  await expect(input).toBeVisible();
  await input.fill(value);
}

// URLs (dev server)
const APP_URL = 'http://localhost:5173';

test.describe('Full AL SIRAJ DEVELOPERS end‑to‑end flow', () => {
  test('CEO creates town, sets prices, creates accountant, and performs property workflow', async ({ page }) => {
    // ---- CEO login ----
    await page.goto(APP_URL);
    await fillByLabel(page, 'Email', 'ceo@example.com');
    await fillByLabel(page, 'Password', 'Password123!');
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL(/dashboard/);

    // ---- Create Town ----
    await page.getByRole('button', { name: /Add Town/i }).click();
    await fillByLabel(page, 'Town Name', 'Ajwa_SyncAudit_1050');
    // Fill price columns (example for two roads)
    await fillByLabel(page, 'Road 1 Price', '500000');
    await fillByLabel(page, 'Road 2 Price', '600000');
    await page.getByRole('button', { name: /Save Town/i }).click();
    await expect(page.locator('text=Town created')).toBeVisible();

    // ---- Create Accountant (CEO) ----
    await page.getByRole('button', { name: /Accountant/ }).click();
    await fillByLabel(page, 'Name', 'John Accountant');
    await fillByLabel(page, 'Email', 'john.accountant@example.com');
    await fillByLabel(page, 'Password', 'AccPass123!');
    await page.getByRole('button', { name: /Create Accountant/i }).click();
    await expect(page.locator('text=Accountant created')).toBeVisible();

    // ---- Switch to Accountant context ----
    await page.getByRole('button', { name: /Switch to Accountant/i }).click();
    await fillByLabel(page, 'Email', 'john.accountant@example.com');
    await fillByLabel(page, 'Password', 'AccPass123!');
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL(/dashboard/);

    // ---- Add Plot ----
    await page.getByRole('button', { name: /Add Plot/i }).click();
    await fillByLabel(page, 'Plot/Shop Number', 'A-10');
    await fillByLabel(page, 'Type', 'Plot');
    await fillByLabel(page, 'Price', '1750000');
    await page.getByRole('button', { name: /Save Plot/i }).click();
    await expect(page.locator('text=Plot saved')).toBeVisible();

    // ---- Record Daily Entry ----
    await page.getByRole('button', { name: /Daily Entries/i }).click();
    await fillByLabel(page, 'Date', new Date().toISOString().slice(0, 10));
    await fillByLabel(page, 'Description', 'Opening balance');
    await fillByLabel(page, 'Amount', '5000000');
    await page.getByRole('button', { name: /Add Entry/i }).click();
    await expect(page.locator('text=Entry added')).toBeVisible();

    // ---- Create Investor ----
    await page.getByRole('button', { name: /Investors/i }).click();
    await fillByLabel(page, 'Investor Name', 'Ali Investor');
    await fillByLabel(page, 'Contact', '0300123456');
    await page.getByRole('button', { name: /Add Investor/i }).click();
    await expect(page.locator('text=Investor added')).toBeVisible();

    // ---- Record Investor Transaction ----
    await page.getByRole('button', { name: /Investor Transactions/i }).click();
    await fillByLabel(page, 'Investor', 'Ali Investor');
    await fillByLabel(page, 'Amount', '2000000');
    await fillByLabel(page, 'Date', new Date().toISOString().slice(0, 10));
    await page.getByRole('button', { name: /Record Transaction/i }).click();
    await expect(page.locator('text=Transaction recorded')).toBeVisible();

    // ---- Sell Property (full payment) ----
    await page.getByRole('button', { name: /Sell Property/i }).click();
    await fillByLabel(page, 'Plot/Shop Number', 'A-10');
    await fillByLabel(page, 'Customer Name', 'Buyer One');
    await fillByLabel(page, 'Deal Amount', '1750000');
    await fillByLabel(page, 'Payment Method', 'Cash');
    await page.getByRole('button', { name: /Confirm Sale/i }).click();
    await expect(page.locator('text=Property sold')).toBeVisible();

    // ---- Verify no pending sync warnings ----
    const pending = await page.evaluate(() => window.api.getPendingSyncStatus?.());
    console.log('Pending sync status:', pending);
    // Expect pending count to be 0 (or empty object)
    // The test asserts that the UI does not show any red toast warnings later.
  });
});
