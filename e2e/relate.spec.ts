import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  addPerson,
  cardOf,
  createTree,
  dragOnto,
  expectNoSeriousA11yViolations,
  longPressDrag,
  openProfile,
  register,
} from './support.ts';

/** The centre of an element on screen, for a real mouse click there. */
async function centreOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('not on screen');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A tree with a progenitor and, in Loose photos, three people added at once. */
async function treeWithLoosePhotos(page: Page, slug: string) {
  await page.goto('/register');
  await register(page, 'Minh', slug);
  await createTree(page, 'Họ Phạm');
  await page.getByRole('button', { name: 'Thêm người đầu tiên' }).click();
  await addPerson(page, 'Phạm Văn Cả');
  const panel = await openProfile(page, 'Phạm Văn Cả');
  await panel.getByRole('button', { name: 'Chọn làm thuỷ tổ' }).click();
  await expect(cardOf(page, 'Phạm Văn Cả')).toHaveAccessibleName('Phạm Văn Cả, đời thứ 1');
  await panel.getByRole('button', { name: 'Đóng hồ sơ' }).click();
  await expect(panel).toBeHidden();

  await page
    .getByRole('group', { name: 'Công cụ của cây' })
    .getByRole('button', { name: 'Thêm nhiều người' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Thêm nhiều người' });
  const people = [
    { name: 'Phạm Văn Hai', gender: 'male' },
    { name: 'Nguyễn Thị Ba', gender: 'female' },
    { name: 'Phạm Thị Tư', gender: 'female' },
  ];
  for (const [at, person] of people.entries()) {
    const row = dialog.getByRole('group', { name: `Người thứ ${at + 1}` });
    await row.getByLabel('Họ và tên').fill(person.name);
    await row.getByLabel('Giới tính').selectOption(person.gender);
  }
  // Once a name is typed, Esc keeps the dialog (and the rows) open.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Thêm vào cây' }).click();
  await expect(dialog).toBeHidden();
  const tray = page.getByRole('region', { name: 'Ảnh chưa dán' });
  for (const { name } of people) await expect(tray.getByRole('button', { name })).toBeVisible();
  return tray;
}

test('drag loose photos onto the tree, reorder siblings, undo from the toast', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'mouse drag');
  const tray = await treeWithLoosePhotos(page, 'drag');

  await dragOnto(page, cardOf(page, 'Phạm Văn Hai'), cardOf(page, 'Phạm Văn Cả'), 'bottom');
  await expect(page.getByText('Đã đổi: Phạm Văn Hai thành con của Phạm Văn Cả')).toBeVisible();
  await expect(cardOf(page, 'Phạm Văn Hai')).toHaveAccessibleName(/đời thứ 2/);
  await expect(cardOf(page, 'Phạm Văn Hai')).toBeFocused();
  // The drop did not open the profile.
  await expect(page.getByRole('complementary')).toHaveCount(0);

  await dragOnto(page, cardOf(page, 'Phạm Thị Tư'), cardOf(page, 'Phạm Văn Cả'), 'bottom');
  await expect(cardOf(page, 'Phạm Thị Tư')).toHaveAccessibleName(/đời thứ 2/);
  // Tư before Hai: the left fifth of a sibling.
  await dragOnto(page, cardOf(page, 'Phạm Thị Tư'), cardOf(page, 'Phạm Văn Hai'), 'left');
  await expect(page.getByText('Đã đổi: Phạm Thị Tư xếp trước Phạm Văn Hai')).toBeVisible();

  await page.getByRole('button', { name: 'Hoàn tác thay đổi này' }).click();
  await expect(page.getByRole('button', { name: 'Hoàn tác thay đổi này' })).toBeHidden();

  // A card dropped on the tray leaves the tree.
  await dragOnto(page, cardOf(page, 'Phạm Văn Hai'), tray, 'middle');
  await expect(page.getByText('Đã đổi: Phạm Văn Hai chuyển vào Ảnh chưa dán')).toBeVisible();
  await expect(tray.getByRole('button', { name: 'Phạm Văn Hai' })).toBeVisible();

  // Esc cancels: nothing changes, no toast.
  const before = await page.getByText(/^Đã đổi:/).textContent();
  const nguyen = await cardOf(page, 'Nguyễn Thị Ba').boundingBox();
  if (nguyen === null) throw new Error('no card');
  await page.mouse.move(nguyen.x + 10, nguyen.y + 10);
  await page.mouse.down();
  await page.mouse.move(nguyen.x + 60, nguyen.y + 10, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByText(/^Đã đổi:/)).toHaveText(before ?? '');
  await expect(page.getByText('Đã lưu', { exact: true })).toBeVisible();
});

test('change relationships from the keyboard, then cut a thread', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard and pointer pins');
  await treeWithLoosePhotos(page, 'keys');

  await cardOf(page, 'Phạm Văn Cả').focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Đổi quan hệ…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Đổi quan hệ của Phạm Văn Cả' });
  await dialog.getByRole('radio', { name: 'Vợ/chồng của Phạm Văn Cả' }).check();
  await dialog.getByRole('searchbox', { name: 'Tìm theo tên' }).fill('nguyen thi ba');
  await expect(dialog.getByText('Tìm thấy 1 người.')).toBeVisible();
  await dialog.getByRole('option', { name: /Nguyễn Thị Ba/ }).click();
  await dialog.getByRole('button', { name: 'Áp dụng' }).click();
  // The modal covers the toast, so the dialog says it too.
  await expect(
    dialog.getByText('Đã đổi: Nguyễn Thị Ba và Phạm Văn Cả thành vợ chồng'),
  ).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Vợ/chồng' })).toContainText('Nguyễn Thị Ba');

  await dialog.getByRole('radio', { name: 'Con của Phạm Văn Cả' }).check();
  await dialog.getByRole('searchbox', { name: 'Tìm theo tên' }).fill('hai');
  await dialog.getByRole('option', { name: /Phạm Văn Hai/ }).click();
  await dialog.getByRole('button', { name: 'Áp dụng' }).click();
  await expect(
    dialog.getByText('Đã đổi: Phạm Văn Hai thành con của Phạm Văn Cả và Nguyễn Thị Ba'),
  ).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Con' })).toContainText('Phạm Văn Hai');
  await expectNoSeriousA11yViolations(page);
  await dialog.getByRole('button', { name: 'Xong' }).click();
  await expect(dialog).toBeHidden();
  await expect(cardOf(page, 'Phạm Văn Cả')).toBeFocused();

  // Cut, with real clicks where they land on the board: the thread's own segment, its pin and the
  // marriage's knot each open "Cắt chỉ". Pins and knots are pointer-only, hidden from screen
  // readers.
  const thread = 'Chỉ nối Phạm Văn Hai với cha mẹ';
  const knot = 'Nút hôn nhân của Phạm Văn Cả và Nguyễn Thị Ba';
  // Measured just before each press: focus returning to a card after a popover closes may scroll
  // the page.
  const segmentCentre = () =>
    page.locator('[data-cut-target="thread"]').evaluate((path) => {
      const hitPath = path as SVGPathElement;
      const middle = hitPath.getPointAtLength(hitPath.getTotalLength() / 2);
      const matrix = hitPath.getScreenCTM();
      if (matrix === null) throw new Error('no thread on screen');
      const point = new DOMPoint(middle.x, middle.y).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    });
  const pinCentre = () => centreOf(page.getByRole('button', { name: thread, includeHidden: true }));
  const knotCentre = () => centreOf(page.getByRole('button', { name: knot, includeHidden: true }));
  for (const [where, name] of [
    [segmentCentre, thread],
    [pinCentre, thread],
    [knotCentre, knot],
  ] as const) {
    const at = await where();
    await page.mouse.click(at.x, at.y);
    await expect(page.getByRole('dialog', { name })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name })).toBeHidden();
  }
  // A press that moves on a pin is not a drag.
  const pin = await pinCentre();
  await page.mouse.move(pin.x, pin.y);
  await page.mouse.down();
  await page.mouse.move(pin.x + 40, pin.y + 30, { steps: 8 });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(page.getByText(/^Đang kéo/)).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: thread, includeHidden: true }).click();
  await page.getByRole('dialog', { name: thread }).getByRole('button', { name: 'Cắt chỉ' }).click();
  await expect(
    page.getByText('Đã đổi: Phạm Văn Hai không còn là con của Phạm Văn Cả và Nguyễn Thị Ba'),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Ảnh chưa dán' })
      .getByRole('button', { name: 'Phạm Văn Hai' }),
  ).toBeVisible();
});

test('long press drags on touch', async ({ page, browserName }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile' || browserName !== 'chromium', 'touch through CDP');
  await treeWithLoosePhotos(page, 'touch');
  await longPressDrag(page, cardOf(page, 'Phạm Văn Hai'), cardOf(page, 'Phạm Văn Cả'), 'bottom');
  await expect(page.getByText('Đã đổi: Phạm Văn Hai thành con của Phạm Văn Cả')).toBeVisible();
  // The long press opened no card menu.
  await expect(page.getByRole('menu')).toHaveCount(0);
});
