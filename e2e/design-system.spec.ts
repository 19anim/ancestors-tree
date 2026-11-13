import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PAGES = [
  { name: 'home', path: '/', heading: 'Gia phả nhà mình, dán từng tấm ảnh.' },
  { name: 'design', path: '/design', heading: 'Bộ thiết kế' },
] as const;

const THEMES = ['light', 'dark'] as const;

const CSP = /Content-Security-Policy = "([^"]+)"/.exec(
  readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8'),
)?.[1];

async function mockHealthyApi(page: Page): Promise<void> {
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: { status: 'ok', version: '0.1.0', uptimeSeconds: 1, database: 'connected' },
    }),
  );
}

async function presetTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem('ancestors-tree:theme', value);
  }, theme);
}

for (const { name, path, heading } of PAGES) {
  for (const theme of THEMES) {
    test(`${name} page, ${theme} theme: screenshot and accessibility`, async ({
      page,
    }, testInfo) => {
      await mockHealthyApi(page);
      await presetTheme(page, theme);
      await page.goto(path);

      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByText('Máy chủ đang hoạt động (phiên bản 0.1.0)')).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
      });

      await page.screenshot({
        path: `test-results/screenshots/${testInfo.project.name}-${name}-${theme}.png`,
        fullPage: true,
      });

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const serious = results.violations
        .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
        .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`);
      expect(serious).toEqual([]);
    });
  }
}

test('loads all three typefaces, including the Vietnamese subset', async ({ page }) => {
  await mockHealthyApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((face) => face.status === 'loaded')
      .map((face) => ({ family: face.family.replaceAll('"', ''), range: face.unicodeRange }));
  });

  const families = new Set(loaded.map((face) => face.family));
  expect([...families]).toEqual(
    expect.arrayContaining(['Be Vietnam Pro', 'Patrick Hand', 'JetBrains Mono']),
  );
  // "Gia phả" in the heading needs U+1EA3, which only the vietnamese subset contains.
  expect(
    loaded.some((face) => face.family === 'Be Vietnam Pro' && face.range.includes('U+1EA0')),
  ).toBe(true);
});

test('remembers the chosen theme after a reload', async ({ page }) => {
  await mockHealthyApi(page);
  await page.goto('/');
  await page.locator('label', { has: page.getByRole('radio', { name: 'Tối' }) }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Tối' })).toBeChecked();
});

test('the skip link is the first thing keyboard users reach', async ({ page }) => {
  await mockHealthyApi(page);
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Bỏ qua, tới nội dung chính' })).toBeFocused();
});

test('turns animations off when the user asks for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockHealthyApi(page);
  await page.goto('/design');
  await page.getByRole('button', { name: 'Mở hộp thoại mẫu' }).click();

  const dialog = page.getByRole('dialog', { name: 'Xoá Cô Hà khỏi cây?' });
  await expect(dialog).toBeVisible();
  const seconds = await dialog.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).animationDuration),
  );
  expect(seconds).toBeLessThan(0.01);
});

test('runs under the production Content-Security-Policy without violations', async ({ page }) => {
  expect(CSP, 'Content-Security-Policy in netlify.toml').toBeTruthy();

  // Serve every document with the same CSP header that Netlify adds in production.
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    return route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': CSP ?? '' },
    });
  });
  await mockHealthyApi(page);

  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Content Security Policy')) {
      violations.push(message.text());
    }
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Bộ thiết kế' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bộ thiết kế' })).toBeVisible();
  await page.getByRole('button', { name: 'Mở hộp thoại mẫu' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // Fonts load lazily; a blocked font would only be reported after it is requested.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  expect(violations).toEqual([]);
});
