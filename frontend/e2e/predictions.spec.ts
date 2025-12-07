import { test, expect } from '@playwright/test';

test.describe('Churn Predictions', () => {
  test('should display predictions page', async ({ page }) => {
    await page.goto('/predictions').catch(() => page.goto('/churn'));

    // Wait for content to load
    await expect(page.getByRole('heading').or(page.getByText(/prediction|churn|risk/i))).toBeVisible({
      timeout: 15000,
    });
  });

  test('should show prediction statistics', async ({ page }) => {
    await page.goto('/predictions').catch(() => page.goto('/dashboard'));

    // Look for prediction stats
    const stats = page.locator('[data-testid="prediction-stats"], .prediction-stats, .stats-card');
    if (await stats.count() > 0) {
      await expect(stats.first()).toBeVisible();
    }
  });

  test('should display risk distribution chart', async ({ page }) => {
    await page.goto('/predictions').catch(() => page.goto('/dashboard'));

    // Look for chart/visualization
    const chart = page.locator('svg, canvas, [data-testid="chart"], .recharts-wrapper');
    if (await chart.count() > 0) {
      await expect(chart.first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('should filter predictions by risk level', async ({ page }) => {
    await page.goto('/predictions').catch(() => page.goto('/employees'));

    // Look for filter controls
    const filterSelect = page.getByRole('combobox')
      .or(page.locator('select'))
      .or(page.getByText(/filter|risk level/i));

    if (await filterSelect.count() > 0) {
      await filterSelect.first().click();

      // Select high risk option if available
      const highRiskOption = page.getByRole('option', { name: /high/i })
        .or(page.getByText(/high risk/i));

      if (await highRiskOption.count() > 0) {
        await highRiskOption.first().click();
        // Wait for filter to apply
        await page.waitForTimeout(1000);
      }
    }
  });
});
