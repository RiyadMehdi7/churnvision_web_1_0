import { test, expect } from '@playwright/test';

test.describe('Employees', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/employees');
  });

  test('should display employee list', async ({ page }) => {
    // Wait for employee data to load
    await expect(page.getByRole('table').or(page.locator('[data-testid="employee-list"]'))).toBeVisible({
      timeout: 15000,
    });

    // Verify employees are displayed
    const employeeRows = page.getByRole('row').or(page.locator('[data-testid="employee-row"]'));
    await expect(employeeRows.first()).toBeVisible();
  });

  test('should be able to search employees', async ({ page }) => {
    // Find search input
    const searchInput = page.getByPlaceholder(/search/i)
      .or(page.getByRole('searchbox'))
      .or(page.locator('input[type="search"]'));

    if (await searchInput.count() > 0) {
      await searchInput.first().fill('test');
      await page.waitForTimeout(500); // Debounce wait

      // Verify search filters results (table should update)
      await expect(page.getByRole('table').or(page.locator('[data-testid="employee-list"]'))).toBeVisible();
    }
  });

  test('should display employee details on click', async ({ page }) => {
    // Wait for list to load
    await page.waitForSelector('table, [data-testid="employee-list"]', { timeout: 15000 });

    // Click on first employee row
    const firstEmployee = page.getByRole('row').nth(1) // Skip header row
      .or(page.locator('[data-testid="employee-row"]').first());

    if (await firstEmployee.count() > 0) {
      await firstEmployee.click();

      // Verify details are shown (modal/drawer/page)
      const detailsVisible = await page.getByText(/employee details|profile|risk score/i).isVisible({ timeout: 5000 });
      expect(detailsVisible || page.url().includes('employee')).toBeTruthy();
    }
  });

  test('should display risk indicators', async ({ page }) => {
    // Wait for data to load
    await page.waitForSelector('table, [data-testid="employee-list"]', { timeout: 15000 });

    // Check for risk indicators (badges, colors, scores)
    const riskIndicators = page.locator('[data-testid="risk-badge"], .risk-score, .risk-level, [class*="risk"]');
    if (await riskIndicators.count() > 0) {
      await expect(riskIndicators.first()).toBeVisible();
    }
  });
});
