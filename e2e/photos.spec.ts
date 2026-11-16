import { expect, test, type Page } from '@playwright/test';
import { addPerson, cardOf, createTree, openProfile, register } from './support.ts';

/** A 1×1 PNG: real enough for the browser to decode and shrink. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const CARD_SRC =
  /^https:\/\/res\.cloudinary\.com\/e2e-cloud\/image\/upload\/c_fill,g_face,w_172,h_148,f_auto,q_auto\/v1\/ancestors-tree\/e2e\/clans\/[0-9a-f]{24}\/people\/[0-9a-f]{24}\/[0-9a-f]{16}$/;
const PROFILE_SRC =
  /^https:\/\/res\.cloudinary\.com\/e2e-cloud\/image\/upload\/c_fill,g_face,w_480,h_480,f_auto,q_auto\/v1\/ancestors-tree\/e2e\/clans\/[0-9a-f]{24}\/people\/[0-9a-f]{24}\/[0-9a-f]{16}$/;

/** Both Cloudinary hosts, faked: the upload answers version 1, as the e2e server assumes. */
async function fakeCloudinary(page: Page): Promise<{ uploads: number }> {
  const seen = { uploads: 0 };
  await page.route('https://api.cloudinary.com/**', async (route) => {
    seen.uploads += 1;
    const form = route.request().postData() ?? '';
    const publicId = /name="public_id"\r\n\r\n([^\r]+)/.exec(form)?.[1] ?? '';
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ public_id: publicId, version: 1, bytes: 1000 }),
    });
  });
  await page.route('https://res.cloudinary.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  );
  return seen;
}

/** The photo on a person's board card: the Polaroid beside the card's button, hidden from AT. */
function cardPhoto(page: Page, name: string) {
  return page
    .locator('.react-flow__node')
    .filter({ has: cardOf(page, name) })
    .locator('img');
}

/** A new tree whose first person is the progenitor, so the board draws the full card. */
async function treeWith(page: Page, account: string, slug: string, fullName: string) {
  await page.goto('/register');
  await register(page, account, slug);
  await createTree(page, 'Họ Lê');
  await page.getByRole('button', { name: 'Thêm người đầu tiên' }).click();
  await addPerson(page, fullName);
  const panel = await openProfile(page, fullName);
  await panel.getByRole('button', { name: 'Chọn làm thuỷ tổ' }).click();
  await expect(cardOf(page, fullName)).toHaveAccessibleName(`${fullName}, đời thứ 1`);
  return panel;
}

/** Closes the profile: on a phone it is a modal sheet that hides the board and the toast. */
async function closeProfile(page: Page, fullName: string) {
  const panel = page.getByRole('complementary', { name: fullName });
  await panel.getByRole('button', { name: 'Đóng hồ sơ' }).click();
  await expect(panel).toBeHidden();
}

test('a photo goes on the card and the profile, and Undo takes it off', async ({ page }) => {
  const seen = await fakeCloudinary(page);
  const panel = await treeWith(page, 'Lê Ảnh', 'photos', 'Lê Văn Một');
  await expect(panel.getByRole('img', { name: 'Ảnh của Lê Văn Một' })).toHaveCount(0);

  // The signing request carries no body: the server signs from the URL alone.
  const signing = page.waitForResponse(
    (response) => response.request().method() === 'POST' && /\/photo-upload$/.test(response.url()),
  );
  await panel.locator('input[type="file"]').setInputFiles({
    name: 'mot.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  const signed = await signing;
  expect(signed.request().postData()).toBeNull();
  expect(signed.status()).toBe(200);

  await expect(page.getByText('Đã đổi: ảnh của Lê Văn Một')).toBeVisible();
  expect(seen.uploads).toBe(1);
  const profileImage = panel.getByRole('img', { name: 'Ảnh của Lê Văn Một' });
  await expect(profileImage).toHaveAttribute('src', PROFILE_SRC);
  await expect(panel.getByRole('button', { name: 'Gỡ ảnh' })).toBeVisible();

  await closeProfile(page, 'Lê Văn Một');
  await expect(cardPhoto(page, 'Lê Văn Một')).toHaveAttribute('src', CARD_SRC);

  // The toast's own Undo, not the toolbar's ↶.
  await page.getByRole('button', { name: 'Hoàn tác thay đổi này' }).click();
  await expect(cardPhoto(page, 'Lê Văn Một')).toHaveCount(0);
  const reopened = await openProfile(page, 'Lê Văn Một');
  await expect(reopened.getByRole('img', { name: 'Ảnh của Lê Văn Một' })).toHaveCount(0);
  await expect(reopened.getByRole('button', { name: 'Gỡ ảnh' })).toBeHidden();
  await expect(reopened.getByRole('button', { name: 'Đổi ảnh' })).toBeVisible();
});

test('Gỡ ảnh removes the photo', async ({ page }) => {
  await fakeCloudinary(page);
  const panel = await treeWith(page, 'Lê Gỡ', 'photos-remove', 'Lê Văn Hai');
  await panel.locator('input[type="file"]').setInputFiles({
    name: 'hai.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(panel.getByRole('img', { name: 'Ảnh của Lê Văn Hai' })).toBeVisible();
  await panel.getByRole('button', { name: 'Gỡ ảnh' }).click();
  await expect(page.getByText('Đã đổi: Lê Văn Hai không còn ảnh')).toBeVisible();
  await expect(panel.getByRole('img', { name: 'Ảnh của Lê Văn Hai' })).toBeHidden();
  await expect(panel.getByRole('button', { name: 'Gỡ ảnh' })).toBeHidden();

  await closeProfile(page, 'Lê Văn Hai');
  await expect(cardOf(page, 'Lê Văn Hai')).toBeVisible();
  await expect(cardPhoto(page, 'Lê Văn Hai')).toHaveCount(0);
});
