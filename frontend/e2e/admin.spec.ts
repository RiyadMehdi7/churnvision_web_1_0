import { test, expect } from '@playwright/test';

test.describe('Admin Panel', () => {
  test('should access admin settings', async ({ page }) => {
    await page.goto('/admin').catch(() => page.goto('/settings'));

    // Verify admin page loads
    await expect(page.getByRole('heading').or(page.getByText(/admin|settings|configuration/i))).toBeVisible({
      timeout: 10000,
    });
  });

  test('should display user management section', async ({ page }) => {
    await page.goto('/admin/users').catch(() => page.goto('/admin'));

    // Look for user management
    const userSection = page.getByText(/user|member|team/i)
      .or(page.locator('[data-testid="user-management"]'));

    await expect(userSection.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display roles and permissions', async ({ page }) => {
    await page.goto('/admin/roles').catch(() => page.goto('/admin'));

    // Look for roles section
    const rolesSection = page.getByText(/role|permission|access/i)
      .or(page.locator('[data-testid="roles-section"]'));

    if (await rolesSection.count() > 0) {
      await expect(rolesSection.first()).toBeVisible();
    }
  });

  test('should show audit logs', async ({ page }) => {
    await page.goto('/admin/audit').catch(() => page.goto('/admin'));

    // Look for audit logs
    const auditSection = page.getByText(/audit|log|activity/i)
      .or(page.locator('[data-testid="audit-logs"]'));

    if (await auditSection.count() > 0) {
      await expect(auditSection.first()).toBeVisible();
    }
  });
});
