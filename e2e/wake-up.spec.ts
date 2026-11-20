import { expect, test, type Page } from '@playwright/test';
import { createTree, expectNoSeriousA11yViolations, register } from './support.ts';

const THEMES = ['light', 'dark'] as const;
const WAKING = 'Đang đánh thức máy chủ…';

/**
 * Answers every API call the way Netlify does while Render sleeps (a 502 with an HTML body,
 * not the API's error body) until `wake()`; the real API after that.
 */
async function sleepingServer(page: Page): Promise<{ wake: () => void }> {
  let asleep = true;
  await page.route('**/api/**', (route) =>
    asleep
      ? route.fulfill({
          status: 502,
          contentType: 'text/html',
          body: '<html><body>Bad gateway</body></html>',
        })
      : route.fallback(),
  );
  return {
    wake: () => {
      asleep = false;
    },
  };
}

for (const theme of THEMES) {
  test(`a sleeping server shows the wake-up screen, then the page works, ${theme} theme`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript((value) => {
      window.localStorage.setItem('ancestors-tree:theme', value);
    }, theme);
    await page.goto('/register');
    await register(page, 'Lê Văn An', 'wake');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Cây gia phả của tôi' }),
    ).toBeVisible();
    await createTree(page, 'Họ Lê');
    await expect(page.getByText('Chưa có ai trong cây gia phả này.')).toBeVisible();

    const server = await sleepingServer(page);
    await page.reload();

    const screen = page.getByRole('dialog', { name: WAKING });
    await expect(screen).toBeVisible();
    await expect(screen.getByRole('heading', { level: 1, name: WAKING })).toBeFocused();
    await expect(screen.getByRole('status')).toHaveText('Đang chờ máy chủ trả lời…');
    // The app stays mounted underneath, inert.
    await expect(page.locator('#root')).toHaveAttribute('inert', '');
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.screenshot({
      path: `test-results/screenshots/${testInfo.project.name}-wake-up-${theme}.png`,
      fullPage: true,
    });
    await expectNoSeriousA11yViolations(page);

    server.wake();
    // The screen checks /api/health every 3 s.
    await expect(screen).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('#root')).not.toHaveAttribute('inert');
    await expect(page.getByText('Chưa có ai trong cây gia phả này.')).toBeVisible();
  });
}
