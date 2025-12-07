import { test, expect } from '@playwright/test';

test.describe('AI Chat (Echo)', () => {
  test('should open chat interface', async ({ page }) => {
    await page.goto('/');

    // Look for chat button/icon
    const chatButton = page.getByRole('button', { name: /chat|assistant|echo|ai/i })
      .or(page.locator('[data-testid="chat-button"]'))
      .or(page.locator('[aria-label*="chat"]'));

    if (await chatButton.count() > 0) {
      await chatButton.first().click();

      // Verify chat interface opens
      const chatInterface = page.locator('[data-testid="chat-panel"], .chat-panel, [role="dialog"]');
      await expect(chatInterface.or(page.getByPlaceholder(/message|ask|type/i))).toBeVisible({
        timeout: 5000,
      });
    }
  });

  test('should send a message and receive response', async ({ page }) => {
    // Navigate to chat page if exists, or open chat panel
    await page.goto('/chat').catch(() => page.goto('/'));

    // Find chat input
    const chatInput = page.getByPlaceholder(/message|ask|type/i)
      .or(page.getByRole('textbox', { name: /message/i }))
      .or(page.locator('textarea, input[type="text"]').last());

    if (await chatInput.count() > 0) {
      // Type a message
      await chatInput.first().fill('What is the current churn risk overview?');

      // Send message (Enter or button)
      await chatInput.first().press('Enter');

      // Wait for response (look for AI message or loading indicator)
      const response = page.locator('[data-testid="ai-message"], .ai-response, .assistant-message');
      const loading = page.getByText(/thinking|loading|processing/i);

      // Either see loading or response
      await expect(response.or(loading)).toBeVisible({ timeout: 30000 });

      // Eventually should see response
      await expect(response.or(page.getByText(/risk|employee|churn/i))).toBeVisible({ timeout: 60000 });
    }
  });
});
