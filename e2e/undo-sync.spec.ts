import { expect, test, type Page } from '@playwright/test';
import {
  addPerson,
  createTree,
  expectNoSeriousA11yViolations,
  openActions,
  register,
  serverCounts,
  signIn,
} from './support.ts';

/** A new account with a tree whose progenitor is Phạm Văn Cả (changes #1 and #2). */
async function treeWithProgenitor(
  page: Page,
  slug: string,
): Promise<{ email: string; clanId: string }> {
  await page.goto('/register');
  const email = await register(page, 'Minh', slug);
  const clanId = await createTree(page, 'Họ Phạm');
  await page.getByRole('button', { name: 'Thêm người đầu tiên' }).click();
  await addPerson(page, 'Phạm Văn Cả');
  await (
    await openActions(page, 'Phạm Văn Cả')
  )
    .getByRole('button', { name: 'Chọn làm thuỷ tổ' })
    .click();
  await expect(page.getByRole('figure', { name: 'Phạm Văn Cả, đời thứ 1' })).toBeVisible();
  return { email, clanId };
}

test('two tabs edit at once: the second one rebases and keeps its change', async ({
  page,
  browser,
  baseURL,
}) => {
  const { email, clanId } = await treeWithProgenitor(page, 'rebase');
  await (
    await openActions(page, 'Phạm Văn Cả')
  )
    .getByRole('button', { name: 'Thêm vợ/chồng' })
    .click();
  await addPerson(page, 'Nguyễn Thị Ba', 'Nữ');
  await expect
    .poll(() => serverCounts(page, clanId))
    .toEqual({ status: 200, persons: 2, unions: 1 });

  // The same account in a second browser: it opens the tree as it is now.
  const second = await browser.newContext({ baseURL });
  const other = await second.newPage();
  await other.goto(`/login?returnTo=${encodeURIComponent(`/clans/${clanId}/tree`)}`);
  await signIn(other, email);
  await expect(other.getByRole('figure', { name: 'Nguyễn Thị Ba, đời thứ 1' })).toBeVisible();

  // The first tab saves a child; the second does not know yet.
  await (await openActions(page, 'Phạm Văn Cả')).getByRole('button', { name: 'Thêm con' }).click();
  await addPerson(page, 'Phạm Văn Hai');
  await expect
    .poll(() => serverCounts(page, clanId))
    .toEqual({ status: 200, persons: 3, unions: 1 });

  // Its change is sent on the old version: 409, rebase on the new ops, sent again.
  const opsPath = `/api/clans/${clanId}/ops`;
  const conflict = other.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === opsPath &&
      response.status() === 409,
  );
  const newOps = other.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === opsPath &&
      new URL(response.url()).searchParams.has('since'),
  );
  await (
    await openActions(other, 'Nguyễn Thị Ba')
  )
    .getByRole('button', { name: 'Thêm con' })
    .click();
  await addPerson(other, 'Phạm Văn Tư');
  await conflict;
  expect((await newOps).status()).toBe(200);
  await expect(other.getByRole('figure', { name: 'Phạm Văn Hai, đời thứ 2' })).toBeVisible();
  await expect(other.getByRole('figure', { name: 'Phạm Văn Tư, đời thứ 2' })).toBeVisible();
  await expect
    .poll(() => serverCounts(page, clanId))
    .toEqual({ status: 200, persons: 4, unions: 1 });
  await expect(other.getByText('Đã lưu', { exact: true })).toBeVisible();
  // Rebased, not reloaded: no notice that unsent changes were dropped.
  await expect(other.getByText(/Đã tải lại bản mới nhất/)).toHaveCount(0);
  await second.close();
});

test('an undo is saved, and the Manager goes back to a point and undoes that', async ({ page }) => {
  const { clanId } = await treeWithProgenitor(page, 'undo');
  // #3: a child (with a one-parent union); #4: a spouse who joins that union.
  await (await openActions(page, 'Phạm Văn Cả')).getByRole('button', { name: 'Thêm con' }).click();
  await addPerson(page, 'Phạm Văn Hai');
  await (
    await openActions(page, 'Phạm Văn Cả')
  )
    .getByRole('button', { name: 'Thêm vợ/chồng' })
    .click();
  await addPerson(page, 'Nguyễn Thị Ba', 'Nữ');
  await expect(page.getByText('Hoàn tác: thêm Nguyễn Thị Ba')).toBeVisible();

  // #5: the undo.
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(page.getByRole('figure', { name: /Nguyễn Thị Ba/ })).toHaveCount(0);
  await expect
    .poll(() => serverCounts(page, clanId))
    .toEqual({ status: 200, persons: 2, unions: 1 });

  await page.reload();
  await expect(page.getByRole('figure', { name: 'Phạm Văn Hai, đời thứ 2' })).toBeVisible();
  await expect(page.getByRole('figure', { name: /Nguyễn Thị Ba/ })).toHaveCount(0);
  // The undo steps belong to the page session: none after a reload. The button stays
  // focusable, so it is marked with aria-disabled rather than disabled.
  await expect(page.getByRole('button', { name: 'Hoàn tác', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  await page.getByRole('link', { name: 'Lịch sử' }).click();
  const history = page.getByRole('list', { name: 'Lịch sử thay đổi' });
  await expect(history.getByRole('listitem')).toHaveCount(5);
  await expect(history.getByRole('listitem').first()).toContainText('Hoàn tác thay đổi #4');
  await expect(history.getByRole('listitem').last()).toContainText('Minh: thêm Phạm Văn Cả');

  // Back to right after the progenitor was chosen: #3, #4 and #5 are undone at once.
  const opener = page.getByRole('button', { name: 'Quay về thời điểm này: sau thay đổi #2' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Quay về sau thay đổi #2?' });
  await expect(dialog).toHaveAccessibleDescription('Số thay đổi sẽ hoàn tác: 3.');
  await expectNoSeriousA11yViolations(page);
  await dialog.getByRole('button', { name: 'Quay về', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect
    .poll(() => serverCounts(page, clanId))
    .toEqual({ status: 200, persons: 1, unions: 0 });
  await expect(history.getByRole('listitem').first()).toContainText('Quay về sau thay đổi #2');

  // One undo brings everything back.
  await page.getByRole('link', { name: 'Cây', exact: true }).click();
  await expect(page.getByRole('figure', { name: 'Phạm Văn Cả, đời thứ 1' })).toBeVisible();
  await expect(page.getByRole('figure', { name: /Phạm Văn Hai/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hoàn tác', exact: true }).click();
  await expect(page.getByRole('figure', { name: 'Phạm Văn Hai, đời thứ 2' })).toBeVisible();
  await expect
    .poll(() => serverCounts(page, clanId))
    .toEqual({ status: 200, persons: 2, unions: 1 });
});

test.describe('on a 375 px phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the tree toolbar fits without scrolling sideways', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'A phone layout check');
    // Choosing the progenitor leaves the longest next-undo text: "Hoàn tác: chọn … làm thuỷ tổ".
    await treeWithProgenitor(page, 'narrow');
    const toolbar = page.getByRole('group', { name: 'Công cụ của cây' });
    await expect(toolbar.getByText('Hoàn tác: chọn Phạm Văn Cả làm thuỷ tổ')).toBeVisible();
    for (const part of [
      toolbar.getByRole('button', { name: 'Hoàn tác', exact: true }),
      toolbar.getByRole('button', { name: 'Làm lại', exact: true }),
      toolbar.getByText('Hoàn tác: chọn Phạm Văn Cả làm thuỷ tổ'),
      toolbar.getByRole('status'),
    ]) {
      await expect(part).toBeInViewport({ ratio: 1 });
    }
    const overflow = await toolbar.evaluate((element) => ({
      toolbar: element.scrollWidth - element.clientWidth,
      page: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(overflow).toEqual({ toolbar: 0, page: 0 });
  });
});

test('arrow keys on the focused board pan the view', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'A keyboard check');
  await treeWithProgenitor(page, 'pan');
  const board = page.getByRole('group', { name: 'Cây gia phả: Họ Phạm' });
  const transform = () =>
    page.locator('.react-flow__viewport').evaluate((element) => element.style.transform);
  // Wait for the first fit and any reveal animation to settle.
  let before = '';
  await expect
    .poll(async () => {
      const first = await transform();
      await page.waitForTimeout(250);
      before = await transform();
      return first === before && before !== '';
    })
    .toBe(true);

  await board.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(board).toBeFocused();
  await expect.poll(transform).not.toBe(before);
});
