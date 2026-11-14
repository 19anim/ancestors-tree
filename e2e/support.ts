import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

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

/** Fills the person form that is open and adds the person. */
export async function addPerson(page: Page, fullName: string, gender: 'Nam' | 'Nữ' = 'Nam') {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Họ và tên').fill(fullName);
  await dialog.getByRole('radio', { name: gender }).check();
  await dialog.getByRole('button', { name: 'Thêm vào cây' }).click();
  await expect(dialog).toBeHidden();
}

export async function openActions(page: Page, name: string) {
  await page.getByRole('button', { name: `Thao tác với ${name}` }).click();
  return page.getByRole('dialog', { name });
}

/** Signs in on the login page that is open. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
}

/** Creates a family tree from the empty list page; returns its id. */
export async function createTree(page: Page, name: string): Promise<string> {
  await page.getByLabel('Tên cây gia phả').fill(name);
  await page.getByRole('button', { name: 'Tạo cây gia phả' }).click();
  await expect(page).toHaveURL(/\/clans\/[0-9a-f]{24}\/tree$/);
  const clanId = /\/clans\/([0-9a-f]{24})\//.exec(page.url())?.[1];
  expect(clanId).toBeDefined();
  return clanId ?? '';
}

/** What the server stores, read with the page's session cookies. */
export async function serverCounts(page: Page, clanId: string) {
  const response = await page.request.get(`/api/clans/${clanId}/tree`);
  if (!response.ok()) return { status: response.status() };
  const tree = (await response.json()) as { persons: unknown[]; unions: unknown[] };
  return { status: response.status(), persons: tree.persons.length, unions: tree.unions.length };
}

export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`);
  expect(serious).toEqual([]);
}
