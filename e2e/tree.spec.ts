import { expect, test } from '@playwright/test';
import {
  addPerson,
  cardOf,
  createTree,
  expectNoSeriousA11yViolations,
  openProfile,
  register,
} from './support.ts';

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
  const tray = page.getByRole('region', { name: 'Ảnh chưa dán' });
  await expect(tray.getByText('Phạm Văn Cả')).toBeVisible();
  const panel = await openProfile(page, 'Phạm Văn Cả');
  await panel.getByRole('button', { name: 'Chọn làm thuỷ tổ' }).click();
  await expect(cardOf(page, 'Phạm Văn Cả')).toHaveAccessibleName('Phạm Văn Cả, đời thứ 1');
  await expect(tray).toBeHidden();
  // The profile stays open after an action, so the next one is in the same panel.
  await expect(panel).toBeVisible();

  // A child first (a one-parent union), then a spouse who joins that union.
  await panel.getByRole('button', { name: 'Thêm con' }).click();
  await addPerson(page, 'Phạm Văn Hai');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Thêm vợ/chồng' }).click();
  await addPerson(page, 'Nguyễn Thị Ba', 'Nữ');
  await expect(panel).toBeVisible();
  await expect(page.getByText('Đã lưu', { exact: true })).toBeVisible();

  // "Đã lưu" is also the idle state, so confirm on the server that every edit is stored. The
  // request shares the page's session cookies.
  const clanId = /\/clans\/([0-9a-f]{24})\//.exec(page.url())?.[1];
  expect(clanId).toBeDefined();
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/clans/${clanId}/tree`);
        if (!response.ok()) return { status: response.status() };
        const tree = (await response.json()) as {
          persons: unknown[];
          unions: unknown[];
          progenitorId: string | null;
        };
        return {
          status: response.status(),
          persons: tree.persons.length,
          unions: tree.unions.length,
          hasProgenitor: tree.progenitorId !== null,
        };
      },
      { message: 'the server stores all three people and the one union' },
    )
    .toEqual({ status: 200, persons: 3, unions: 1, hasProgenitor: true });

  await page.reload();
  await expect(cardOf(page, 'Phạm Văn Cả')).toHaveAccessibleName('Phạm Văn Cả, đời thứ 1');
  // The photo, under the card's button, is hidden from screen readers; the button says the name.
  await expect(cardOf(page, 'Nguyễn Thị Ba')).toHaveAccessibleName('Nguyễn Thị Ba, đời thứ 1');
  await expect(cardOf(page, 'Nguyễn Thị Ba').locator('..').locator('figure')).toHaveAttribute(
    'data-tape',
    'in-law',
  );
  await expect(cardOf(page, 'Phạm Văn Hai')).toHaveAccessibleName('Phạm Văn Hai, đời thứ 2');
  // React Flow draws the thread once the cards are measured; the couple shares one stitch.
  await expect(page.locator('[data-relation="parent-child"]')).toHaveCount(1);
  await expect(page.locator('[data-relation="marriage"]')).toHaveCount(1);
  // The threads are decoration: React Flow must not expose them as images.
  await expect(page.getByRole('img', { name: /^Edge from/ })).toHaveCount(0);

  await expectNoSeriousA11yViolations(page);
});

test('the Manager deletes the family tree', async ({ page }) => {
  await page.goto('/register');
  await register(page, 'Thu', 'thu');
  await page.getByLabel('Tên cây gia phả').fill('Họ Đỗ');
  await page.getByRole('button', { name: 'Tạo cây gia phả' }).click();
  await expect(page).toHaveURL(/\/tree$/);
  const treeUrl = page.url();
  const clanId = /\/clans\/([0-9a-f]{24})\//.exec(treeUrl)?.[1];
  expect(clanId).toBeDefined();

  await page.getByRole('link', { name: 'Cài đặt' }).click();
  await page.getByRole('button', { name: 'Xoá cây gia phả này' }).click();
  const dialog = page.getByRole('dialog', { name: 'Xoá Họ Đỗ?' });
  await dialog.getByLabel('Nhập "Họ Đỗ" để xác nhận').fill('Họ Đỗ');
  await dialog.getByRole('button', { name: 'Xoá vĩnh viễn' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Cây gia phả của tôi' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Họ Đỗ/ })).toHaveCount(0);

  // The server no longer knows the tree: the API answers 404 and the page says so.
  const response = await page.request.get(`/api/clans/${clanId}/tree`);
  expect(response.status()).toBe(404);
  await page.goto(treeUrl);
  await expect(page.getByRole('alert')).toHaveText('Không tìm thấy nội dung bạn cần.');
  await expect(page.getByRole('link', { name: 'Về danh sách cây gia phả' })).toBeVisible();
});

test('on a phone, the board that appears behind the profile sheet stays out of reach', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'A phone layout check');
  await page.goto('/register');
  await register(page, 'Minh', 'sheet');
  await createTree(page, 'Họ Phạm');
  await page.getByRole('button', { name: 'Thêm người đầu tiên' }).click();
  await addPerson(page, 'Phạm Văn Cả');
  // From the tray: once chosen, the board mounts behind the open sheet.
  const panel = await openProfile(page, 'Phạm Văn Cả');
  await panel.getByRole('button', { name: 'Chọn làm thuỷ tổ' }).click();
  await expect(cardOf(page, 'Phạm Văn Cả')).toHaveAccessibleName('Phạm Văn Cả, đời thứ 1');
  await expect(panel).toBeVisible();

  const stops = await panel.locator('button, a[href], input, textarea, select').count();
  await panel.getByRole('button', { name: 'Đóng hồ sơ' }).focus();
  for (let press = 0; press < stops + 2; press += 1) {
    await page.keyboard.press('Shift+Tab');
    // In the sheet, or out to the browser itself; never on the board behind it.
    const where = await panel.evaluate((element) => {
      const active = document.activeElement;
      if (active === null || active === document.body) return 'browser';
      return element.contains(active) ? 'sheet' : active.outerHTML.slice(0, 80);
    });
    expect(['sheet', 'browser'], `Shift+Tab #${press + 1}`).toContain(where);
  }
});
