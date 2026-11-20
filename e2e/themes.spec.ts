import { expect, test, type Page } from '@playwright/test';
import { addPerson, cardOf, createTree, openProfile, register } from './support.ts';

const BOARD = 'Cây gia phả: Họ Phạm';

/** A new account with a tree whose progenitor is Phạm Văn Cả; returns the clan id. */
async function treeWithProgenitor(page: Page, slug: string): Promise<string> {
  await page.goto('/register');
  await register(page, 'Minh', slug);
  const clanId = await createTree(page, 'Họ Phạm');
  await page.getByRole('button', { name: 'Thêm người đầu tiên' }).click();
  await addPerson(page, 'Phạm Văn Cả');
  const panel = await openProfile(page, 'Phạm Văn Cả');
  await panel.getByRole('button', { name: 'Chọn làm thuỷ tổ' }).click();
  await expect(cardOf(page, 'Phạm Văn Cả')).toHaveAccessibleName('Phạm Văn Cả, đời thứ 1');
  await panel.getByRole('button', { name: 'Đóng hồ sơ' }).click();
  await expect(panel).toBeHidden();
  return clanId;
}

/** The family's stored theme, read with the page's session. */
async function clanTheme(page: Page, clanId: string) {
  const response = await page.request.get(`/api/clans/${clanId}/tree`);
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { theme?: Record<string, string> }).theme ?? {};
}

/** My stored choices, read with the page's session. */
async function myPreference(page: Page, clanId: string) {
  const response = await page.request.get(`/api/clans/${clanId}/view-preference`);
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as { enabled: boolean; theme: Record<string, string> };
}

test('whole family: a surface for everyone, undone, then kept after a reload', async ({
  page,
}, testInfo) => {
  const clanId = await treeWithProgenitor(page, 'theme-clan');
  const board = page.getByRole('group', { name: BOARD });
  await page.getByRole('button', { name: 'Trang trí' }).click();
  const panel = page.getByRole('complementary', { name: 'Trang trí cây' });
  await expect(panel.getByRole('radio', { name: 'Cả họ' })).toBeChecked();

  await panel.getByText('Bảng gỗ bần').click();
  await expect(board).toHaveAttribute('data-surface', 'corkboard');
  await expect(page.getByText('Đã đổi: chủ đề cây')).toBeVisible();
  await expect
    .poll(() => clanTheme(page, clanId))
    .toEqual({
      surface: 'corkboard',
      fastener: 'pushpin',
    });
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}-theme-corkboard.png`,
  });

  // The toast stays usable while the panel is open, a modal sheet on a phone.
  await page.getByRole('button', { name: 'Hoàn tác thay đổi này' }).click();
  await expect(board).toHaveAttribute('data-surface', 'grid-paper');
  await expect(panel).toBeVisible();
  await expect.poll(() => clanTheme(page, clanId)).toEqual({});

  await panel.getByText('Bảng gỗ bần').click();
  await expect
    .poll(() => clanTheme(page, clanId))
    .toEqual({
      surface: 'corkboard',
      fastener: 'pushpin',
    });
  await page.reload();
  await expect(page.getByRole('group', { name: BOARD })).toHaveAttribute(
    'data-surface',
    'corkboard',
  );
});

test('only me: my board changes, the family keeps its own, and I can go back', async ({
  page,
}, testInfo) => {
  const clanId = await treeWithProgenitor(page, 'theme-me');
  await page.getByRole('button', { name: 'Trang trí' }).click();
  const panel = page.getByRole('complementary', { name: 'Trang trí cây' });
  await panel.getByText('Chỉ mình tôi').click();
  await panel.getByText('Cửa tủ lạnh').click();
  const board = page.getByRole('group', { name: BOARD });
  await expect(board).toHaveAttribute('data-surface', 'fridge');
  await expect(page.getByText('Bạn đang xem chủ đề của riêng mình.')).toBeVisible();
  await expect
    .poll(() => myPreference(page, clanId))
    .toMatchObject({ enabled: true, theme: { surface: 'fridge' } });
  expect(await clanTheme(page, clanId)).toEqual({});
  await page.screenshot({
    path: `test-results/screenshots/${testInfo.project.name}-theme-fridge.png`,
  });

  await page.reload();
  await expect(page.getByRole('group', { name: BOARD })).toHaveAttribute('data-surface', 'fridge');
  await page.getByRole('button', { name: 'Về chủ đề chung' }).click();
  await expect(page.getByRole('group', { name: BOARD })).toHaveAttribute(
    'data-surface',
    'grid-paper',
  );
  await expect
    .poll(() => myPreference(page, clanId))
    .toMatchObject({ enabled: false, theme: { surface: 'fridge' } });

  await page.reload();
  await expect(page.getByRole('group', { name: BOARD })).toHaveAttribute(
    'data-surface',
    'grid-paper',
  );
  await expect(page.getByText('Bạn đang xem chủ đề của riêng mình.')).toBeHidden();
});

test('a viewer decorates only for themselves', async ({ page, browser, baseURL }) => {
  const clanId = await treeWithProgenitor(page, 'theme-owner');
  await page.getByRole('link', { name: 'Thành viên' }).click();
  await page.getByLabel('Vai trò khi tham gia').selectOption({ label: 'Xem' });
  await page.getByRole('button', { name: 'Tạo link mời' }).click();
  const inviteUrl = await page.getByRole('textbox', { name: /Link mời/ }).inputValue();

  const relative = await browser.newContext({ baseURL });
  try {
    const viewer = await relative.newPage();
    await viewer.goto(inviteUrl);
    await expect(viewer.getByText('Minh mời bạn vào Họ Phạm với vai trò Xem.')).toBeVisible();
    await viewer.getByRole('link', { name: 'Tạo tài khoản' }).click();
    await register(viewer, 'Tuấn', 'theme-viewer');
    await viewer.getByRole('button', { name: 'Tham gia' }).click();
    await expect(viewer).toHaveURL(/\/clans\/[^/]+\/tree$/);

    await viewer.getByRole('button', { name: 'Trang trí' }).click();
    const panel = viewer.getByRole('complementary', { name: 'Trang trí cây' });
    await expect(panel.getByRole('radio', { name: 'Cả họ' })).toBeDisabled();
    await expect(panel.getByRole('radio', { name: 'Chỉ mình tôi' })).toBeChecked();
    await expect(panel.getByText('Người xem chỉ trang trí được cho riêng mình.')).toBeVisible();
    await panel.getByText('Cửa tủ lạnh').click();
    await expect(viewer.getByRole('group', { name: BOARD })).toHaveAttribute(
      'data-surface',
      'fridge',
    );
    await expect
      .poll(() => myPreference(viewer, clanId))
      .toMatchObject({ enabled: true, theme: { surface: 'fridge' } });
  } finally {
    await relative.close();
  }

  await page.goto(`/clans/${clanId}/tree`);
  await expect(page.getByRole('group', { name: BOARD })).toHaveAttribute(
    'data-surface',
    'grid-paper',
  );
  expect(await clanTheme(page, clanId)).toEqual({});
});
