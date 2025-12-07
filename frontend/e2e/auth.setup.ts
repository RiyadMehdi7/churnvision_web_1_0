import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.auth/user.json';

/**
 * Authentication setup - runs before all tests to establish auth state
 */
setup('authenticate', async ({ page }) => {
  // Navigate to login page
  await page.goto('/login');

  // Fill in credentials
  await page.getByLabel(/username|email/i).fill(process.env.E2E_USERNAME || 'admin');
  await page.getByLabel(/password/i).fill(process.env.E2E_PASSWORD || 'admin123');

  // Submit login form
  await page.getByRole('button', { name: /sign in|login|log in/i }).click();

  // Wait for navigation to dashboard or main page
  await expect(page).toHaveURL(/\/(dashboard|home|$)/);

  // Verify user is logged in (check for user menu or logout button)
  await expect(
    page.getByRole('button', { name: /user|profile|account/i }).or(
      page.getByText(/logout|sign out/i)
    )
  ).toBeVisible({ timeout: 10000 });

  // Save authentication state
  await page.context().storageState({ path: authFile });
});
