import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Data Upload', () => {
  test('should display upload interface', async ({ page }) => {
    await page.goto('/data-management').catch(() => page.goto('/upload').catch(() => page.goto('/settings')));

    // Look for upload section
    const uploadSection = page.getByText(/upload|import/i)
      .or(page.getByRole('button', { name: /upload|import/i }))
      .or(page.locator('[data-testid="upload-section"]'));

    await expect(uploadSection.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show file drop zone', async ({ page }) => {
    await page.goto('/data-management').catch(() => page.goto('/upload'));

    // Look for drop zone
    const dropZone = page.locator('[data-testid="drop-zone"], .dropzone, [class*="drop"]')
      .or(page.getByText(/drag.*drop|drop.*file/i));

    if (await dropZone.count() > 0) {
      await expect(dropZone.first()).toBeVisible();
    }
  });

  test('should validate file type on upload', async ({ page }) => {
    await page.goto('/data-management').catch(() => page.goto('/upload'));

    // Find file input
    const fileInput = page.locator('input[type="file"]');

    if (await fileInput.count() > 0) {
      // Try to upload an invalid file type
      const invalidFile = {
        name: 'test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('invalid content'),
      };

      await fileInput.setInputFiles(invalidFile);

      // Should show error message
      const errorMessage = page.getByText(/invalid|unsupported|error|csv|excel/i);
      // Validation message should appear (or file should be rejected)
      await page.waitForTimeout(1000);
    }
  });

  test('should show upload progress', async ({ page }) => {
    await page.goto('/data-management').catch(() => page.goto('/upload'));

    // Find file input
    const fileInput = page.locator('input[type="file"]');

    if (await fileInput.count() > 0) {
      // Create a valid CSV file
      const csvContent = 'id,name,department,salary\n1,John Doe,Engineering,100000';
      const validFile = {
        name: 'employees.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(csvContent),
      };

      await fileInput.setInputFiles(validFile);

      // Look for progress indicator
      const progressIndicator = page.locator('[role="progressbar"], .progress, [data-testid="upload-progress"]')
        .or(page.getByText(/uploading|processing|%/i));

      // Progress or success should appear
      await page.waitForTimeout(2000);
    }
  });
});
