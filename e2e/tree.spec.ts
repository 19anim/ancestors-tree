import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { register } from './support.ts';

/** Fills the person form that is open and adds the person. */
async function addPerson(page: Page, fullName: string, gender: 'Nam' | 'Nữ' = 'Nam') {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Họ và tên').fill(fullName);
  await dialog.getByRole('radio', { name: gender }).check();
  await dialog.getByRole('button', { name: 'Thêm vào cây' }).click();
  await expect(dialog).toBeHidden();
}

async function openActions(page: Page, name: string) {
  await page.getByRole('button', { name: `Thao tác với ${name}` }).click();
  return page.getByRole('dialog', { name });
}

test('build a small family tree and find it again after a reload', async ({ page }) => {
  await page.goto('/register');
  await register(page, 'Minh', 'minh');
  await expect(page.getByRole('heading', { level: 1, name: 'Cây gia phả của tôi' })).toBeVisible();

  await page.getByLabel('Tên cây gia phả').fill('Họ Phạm');
  await page.getByRole('button', { name: 'Tạo cây gia phả' }).click();
  await expect(page).toHaveURL(/\/clans\/[0-9a-f]{24}\/tree$/);
  await expect(page.getByText('Chưa có ai trong cây gia phả này.')).toBeVisible();

  // The first person waits in the tray until the Manager makes them the progenitor.
  await page.getByRole('button', { name: 'Thêm người đầu tiên' }).click();
  await addPerson(page, 'Phạm Văn Cả');
  const tray = page.getByRole('region', { name: 'Chưa nối vào cây' });
  await expect(tray.getByText('Phạm Văn Cả')).toBeVisible();
  await (
    await openActions(page, 'Phạm Văn Cả')
  )
    .getByRole('button', { name: 'Chọn làm thuỷ tổ' })
    .click();
  await expect(page.getByRole('figure', { name: 'Phạm Văn Cả, đời thứ 1' })).toBeVisible();
  await expect(tray).toBeHidden();

  // A child first (a one-parent union), then a spouse who joins that union.
  await (await openActions(page, 'Phạm Văn Cả')).getByRole('button', { name: 'Thêm con' }).click();
  await addPerson(page, 'Phạm Văn Hai');
  await (
    await openActions(page, 'Phạm Văn Cả')
  )
    .getByRole('button', { name: 'Thêm vợ/chồng' })
    .click();
  await addPerson(page, 'Nguyễn Thị Ba', 'Nữ');
  await expect(page.getByText('Đã lưu', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('figure', { name: 'Phạm Văn Cả, đời thứ 1' })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Nguyễn Thị Ba, đời thứ 1' })).toHaveAttribute(
    'data-tape',
    'in-law',
  );
  await expect(page.getByRole('figure', { name: 'Phạm Văn Hai, đời thứ 2' })).toBeVisible();
  // React Flow draws the thread once the cards are measured; the couple shares one stitch.
  await expect(page.locator('[data-relation="parent-child"]')).toHaveCount(1);
  await expect(page.locator('[data-relation="marriage"]')).toHaveCount(1);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length})`);
  expect(serious).toEqual([]);
});

test('the Manager deletes the family tree', async ({ page }) => {
  await page.goto('/register');
  await register(page, 'Thu', 'thu');
  await page.getByLabel('Tên cây gia phả').fill('Họ Đỗ');
  await page.getByRole('button', { name: 'Tạo cây gia phả' }).click();
  await expect(page).toHaveURL(/\/tree$/);

  await page.getByRole('link', { name: 'Cài đặt' }).click();
  await page.getByRole('button', { name: 'Xoá cây gia phả này' }).click();
  const dialog = page.getByRole('dialog', { name: 'Xoá Họ Đỗ?' });
  await dialog.getByLabel('Nhập "Họ Đỗ" để xác nhận').fill('Họ Đỗ');
  await dialog.getByRole('button', { name: 'Xoá vĩnh viễn' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Cây gia phả của tôi' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Họ Đỗ/ })).toHaveCount(0);
});
