import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'correct horse 1';

function uniqueEmail(name: string): string {
  return `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function register(page: Page, name: string, slug: string): Promise<string> {
  const email = uniqueEmail(slug);
  await page.getByLabel('Tên hiển thị').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  return email;
}

test('sign up, create a clan, invite a relative and see them join', async ({ page, browser }) => {
  await page.goto('/register');
  await register(page, 'Lan', 'lan');
  await expect(page.getByRole('heading', { level: 1, name: 'Cây gia phả của tôi' })).toBeVisible();

  await page.getByLabel('Tên cây gia phả').fill('Họ Nguyễn');
  await page.getByRole('button', { name: 'Tạo cây gia phả' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Họ Nguyễn' })).toBeVisible();
  await expect(page.getByText('Chưa có ai trong cây gia phả này.')).toBeVisible();
  await page.getByRole('link', { name: 'Thành viên' }).click();

  await page.getByLabel('Vai trò khi tham gia').selectOption({ label: 'Biên tập' });
  await page.getByRole('button', { name: 'Tạo link mời' }).click();
  const inviteUrl = await page.getByRole('textbox', { name: /Link mời/ }).inputValue();
  expect(inviteUrl).toMatch(/\/join\/[A-Za-z0-9_-]{32}$/);

  // A relative opens the link in their own browser.
  const relative = await browser.newContext({ baseURL: 'http://localhost:4173' });
  try {
    const relativePage = await relative.newPage();
    await relativePage.goto(inviteUrl);
    await expect(
      relativePage.getByText('Lan mời bạn vào Họ Nguyễn với vai trò Biên tập.'),
    ).toBeVisible();
    await relativePage.getByRole('link', { name: 'Tạo tài khoản' }).click();
    await register(relativePage, 'Tuấn', 'tuan');
    await relativePage.getByRole('button', { name: 'Tham gia' }).click();
    await expect(relativePage.getByRole('heading', { level: 1, name: 'Họ Nguyễn' })).toBeVisible();
    await expect(relativePage).toHaveURL(/\/clans\/[^/]+\/tree$/);
  } finally {
    await relative.close();
  }

  await page.reload();
  await expect(page.getByText('Tuấn', { exact: true })).toBeVisible();
});

test('a silent refresh keeps the user signed in, and sign-out then sign-in works', async ({
  page,
  context,
}) => {
  await page.goto('/register');
  const email = await register(page, 'Hà', 'ha');
  await expect(page.getByRole('heading', { level: 1, name: 'Cây gia phả của tôi' })).toBeVisible();

  // The access token expires: only the refresh cookie is left, and the proxy must carry it.
  await context.clearCookies({ name: 'at' });
  expect((await context.cookies()).some((cookie) => cookie.name === 'at')).toBe(false);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Cây gia phả của tôi' })).toBeVisible();
  await expect(page.getByText('Hà', { exact: true })).toBeVisible();
  expect((await context.cookies()).some((cookie) => cookie.name === 'at')).toBe(true);

  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await page.goto('/clans');
  await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Cây gia phả của tôi' })).toBeVisible();
});

test('protected pages send visitors to sign in and back', async ({ page }) => {
  await page.goto('/clans');
  await expect(page.getByRole('heading', { level: 1, name: 'Đăng nhập' })).toBeVisible();
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fclans$/);
});

test('the sign-in and sign-up pages pass axe', async ({ page }) => {
  for (const path of ['/login', '/register', '/forgot-password']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, path).toEqual([]);
  }
});
