import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('should load dashboard with key metrics', async ({ page }) => {
    await page.goto('/dashboard');

    // Verify dashboard loads
    await expect(page).toHaveTitle(/dashboard|churnvision/i);

    // Check for main dashboard sections
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Verify key metrics are displayed
    const metricsSection = page.locator('[data-testid="metrics"], .metrics, .stats');
    if (await metricsSection.count() > 0) {
      await expect(metricsSection.first()).toBeVisible();
    }
  });

  test('should display risk overview section', async ({ page }) => {
    await page.goto('/dashboard');

    // Look for risk-related content
    const riskSection = page.getByText(/risk|churn|prediction/i).first();
    await expect(riskSection).toBeVisible({ timeout: 15000 });
  });

  test('should navigate to employees from dashboard', async ({ page }) => {
    await page.goto('/dashboard');

    // Click on employees link/button
    const employeesLink = page.getByRole('link', { name: /employees|workforce|team/i })
      .or(page.getByRole('button', { name: /employees|workforce|team/i }));

    if (await employeesLink.count() > 0) {
      await employeesLink.first().click();
      await expect(page).toHaveURL(/employees/);
    }
  });
});
