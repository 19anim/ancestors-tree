import { expect, test, type Page } from '@playwright/test';
import {
  addPerson,
  cardOf,
  createTree,
  expectNoSeriousA11yViolations,
  openProfile,
  register,
} from './support.ts';

const THEMES = ['light', 'dark'] as const;
const WAKING = 'Đang đánh thức máy chủ…';
const NOT_AWAKE = 'Máy chủ chưa thức dậy';
/** The screen gives up and offers "Thử lại" after 2 minutes (GIVE_UP_MS). */
const GIVE_UP_MS = 2 * 60_000;
/** What Netlify answers while Render sleeps: a gateway error, not the API's error body. */
const BAD_GATEWAY = {
  status: 502,
  contentType: 'text/html',
  body: '<html><body>Bad gateway</body></html>',
};

/**
 * Answers every API call the way Netlify does while Render sleeps (a 502 with an HTML body,
 * not the API's error body) until `wake()`; the real API after that.
 */
async function sleepingServer(page: Page): Promise<{ wake: () => void }> {
  let asleep = true;
  await page.route('**/api/**', (route) =>
    asleep ? route.fulfill(BAD_GATEWAY) : route.fallback(),
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

test('a dialog keeps what was typed in it while the wake-up screen shows', async ({ page }) => {
  await page.goto('/register');
  await register(page, 'Lê Văn An', 'wake-draft');
  await createTree(page, 'Họ Lê');
  await page.getByRole('button', { name: 'Thêm người đầu tiên' }).click();
  await addPerson(page, 'Lê Văn An');
  const panel = await openProfile(page, 'Lê Văn An');
  await panel.getByRole('button', { name: 'Chọn làm thuỷ tổ' }).click();
  await expect(cardOf(page, 'Lê Văn An')).toHaveAccessibleName('Lê Văn An, đời thứ 1');

  // The next save stays in flight, then fails the way a sleeping server answers: the wake-up
  // screen comes up while the user is typing in another dialog.
  let asleep = false;
  let holdNextSave = true;
  let releaseSave = () => {};
  const saveReleased = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    if (holdNextSave && request.method() === 'POST' && request.url().endsWith('/ops')) {
      holdNextSave = false;
      await saveReleased;
      await route.fulfill(BAD_GATEWAY);
    } else if (asleep) {
      await route.fulfill(BAD_GATEWAY);
    } else {
      await route.fallback();
    }
  });

  await panel.getByRole('button', { name: 'Thêm con' }).click();
  await addPerson(page, 'Lê Văn Hai');
  await panel.getByRole('button', { name: 'Thêm vợ/chồng' }).click();
  const form = page.getByRole('dialog', { name: 'Thêm vợ/chồng của Lê Văn An' });
  await form.getByLabel('Họ và tên').fill('Nguyễn Thị Ba');

  // A fake clock from here on, so the 2-minute wait for "Thử lại" can be skipped.
  await page.clock.install();
  asleep = true;
  releaseSave();

  // Scoped to the screen: role queries also see the inert page underneath.
  const wakeScreen = page.getByRole('dialog', { name: new RegExp(`^(${WAKING}|${NOT_AWAKE})$`) });
  await expect(wakeScreen.getByRole('heading', { level: 1, name: WAKING })).toBeVisible();
  await expect(page.locator('#root')).toHaveAttribute('inert', '');
  // Radix hears Escape and pointer downs on the whole document, the screen's included.
  await page.keyboard.press('Escape');
  await wakeScreen.click({ position: { x: 5, y: 5 } });

  await page.clock.fastForward(GIVE_UP_MS);
  await expect(wakeScreen.getByRole('heading', { level: 1, name: NOT_AWAKE })).toBeVisible();
  await wakeScreen.getByRole('button', { name: 'Thử lại' }).click();
  await expect(wakeScreen.getByRole('heading', { level: 1, name: WAKING })).toBeVisible();
  await page.keyboard.press('Escape');

  asleep = false;
  // The screen checks /api/health every 3 s.
  await expect(wakeScreen).toBeHidden({ timeout: 10_000 });
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Họ và tên')).toHaveValue('Nguyễn Thị Ba');
});
