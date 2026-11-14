import type { Page } from '@playwright/test';

export const PASSWORD = 'correct horse 1';

export function uniqueEmail(name: string): string {
  return `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

/** Fills the sign-up form on the current page; returns the new account's email. */
export async function register(page: Page, name: string, slug: string): Promise<string> {
  const email = uniqueEmail(slug);
  await page.getByLabel('Tên hiển thị').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
  return email;
}
