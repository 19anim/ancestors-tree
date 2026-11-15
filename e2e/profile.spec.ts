import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  addPerson,
  cardOf,
  createTree,
  expectNoSeriousA11yViolations,
  openProfile,
  register,
} from './support.ts';

const BOARD = 'Cây gia phả: Họ Phạm';
const CHILDREN = [
  'Phạm Văn Một',
  'Phạm Văn Hai',
  'Phạm Văn Ba',
  'Phạm Văn Tư',
  'Phạm Văn Năm',
] as const;

let clanId = '';

test.beforeEach(async ({ page }) => {
  await page.goto('/register');
  await register(page, 'Phạm Lan', 'profile');
  clanId = await createTree(page, 'Họ Phạm');
  await page.getByRole('button', { name: 'Thêm người đầu tiên' }).click();
  await addPerson(page, 'Phạm Văn Cả');
  // On the board, as the progenitor: the full card (with its date line) and the Add parent offer.
  const panel = await openProfile(page, 'Phạm Văn Cả');
  await panel.getByRole('button', { name: 'Chọn làm thuỷ tổ' }).click();
  await expect(cardOf(page, 'Phạm Văn Cả')).toHaveAccessibleName('Phạm Văn Cả, đời thứ 1');
  await panel.getByRole('button', { name: 'Đóng hồ sơ' }).click();
  await expect(panel).toBeHidden();
});

/** The stored death date of a person, read with the page's session cookies. */
async function storedDeath(page: Page, fullName: string) {
  const response = await page.request.get(`/api/clans/${clanId}/tree`);
  if (!response.ok()) return null;
  const tree = (await response.json()) as {
    persons: { fullName: string; death?: { date?: unknown } }[];
  };
  return tree.persons.find((person) => person.fullName === fullName)?.death?.date ?? null;
}

/** Adds children to a person from their profile, then closes it. */
async function addChildren(page: Page, parent: string, names: readonly string[]) {
  const panel = await openProfile(page, parent);
  for (const name of names) {
    await panel.getByRole('button', { name: 'Thêm con' }).click();
    await addPerson(page, name);
    await expect(cardOf(page, name)).toBeVisible();
  }
  await panel.getByRole('button', { name: 'Đóng hồ sơ' }).click();
  await expect(panel).toBeHidden();
}

/** The board's view (React Flow's `translate(Xpx, Ypx) scale(Z)`), as a string. */
function viewportTransform(page: Page) {
  return page.locator('.react-flow__viewport').evaluate((element) => element.style.transform);
}

/** Waits until the view stops moving: two polls in a row read the same transform. */
async function waitForViewToSettle(page: Page) {
  let before: string | null = null;
  await expect
    .poll(
      async () => {
        const now = await viewportTransform(page);
        const settled = now !== '' && now === before;
        before = now;
        return settled;
      },
      { intervals: [250], message: 'the board view stops moving' },
    )
    .toBe(true);
}

/** The board's visible area: the board's box, clipped to the window. */
async function visibleBoardArea(page: Page) {
  const box = await page.getByRole('group', { name: BOARD }).boundingBox();
  const size = page.viewportSize();
  if (box === null || size === null) return null;
  const left = Math.max(box.x, 0);
  const top = Math.max(box.y, 0);
  return {
    left,
    top,
    right: Math.min(box.x + box.width, size.width),
    bottom: Math.min(box.y + box.height, size.height),
  };
}

/** True when the card's whole box is inside the board's visible area. */
async function isFullyOnBoard(page: Page, card: Locator) {
  const area = await visibleBoardArea(page);
  const box = await card.boundingBox();
  if (area === null || box === null) return false;
  return (
    box.x >= area.left &&
    box.y >= area.top &&
    box.x + box.width <= area.right &&
    box.y + box.height <= area.bottom
  );
}

async function expectFullyOnBoard(page: Page, card: Locator) {
  await waitForViewToSettle(page);
  await expect
    .poll(() => isFullyOnBoard(page, card), { message: 'the focused card is fully on the board' })
    .toBe(true);
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test('edits a lunar death date and shows the anniversary on the card', async ({ page }) => {
  const panel = await openProfile(page, 'Phạm Văn Cả');
  await panel.getByRole('button', { name: 'Sửa' }).click();
  await panel.getByRole('radio', { name: 'Đã mất' }).check();
  const death = panel.getByRole('group', { name: 'Ngày mất' });
  await death.getByLabel('Ngày', { exact: true }).fill('15');
  await death.getByLabel('Tháng', { exact: true }).fill('10');
  await death.getByLabel('Năm', { exact: true }).fill('1990');
  await expect(death).toContainText('dương lịch');
  await panel.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByText('Giỗ 15/10 ÂL')).toBeVisible();

  // Saved on the server first: a reload with unsent changes would ask before leaving.
  await expect.poll(() => storedDeath(page, 'Phạm Văn Cả')).not.toBeNull();
  // The open profile is in the URL: a reload shows it again, with the saved date.
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Phạm Văn Cả' })).toContainText(
    '15/10/1990 âm lịch',
  );
});

test('the profile and its date input have no serious a11y violations', async ({ page }) => {
  const panel = await openProfile(page, 'Phạm Văn Cả');
  await expectNoSeriousA11yViolations(page);
  await panel.getByRole('button', { name: 'Sửa' }).click();
  await panel.getByRole('radio', { name: 'Đã mất' }).check();
  const death = panel.getByRole('group', { name: 'Ngày mất' });
  await death.getByLabel('Ngày', { exact: true }).fill('15');
  await death.getByLabel('Tháng', { exact: true }).fill('10');
  await death.getByLabel('Năm', { exact: true }).fill('1990');
  await expect(death).toContainText('dương lịch');
  await expectNoSeriousA11yViolations(page);
});

test('the Owner adds a parent above the progenitor, and arrows move between them', async ({
  page,
}) => {
  const panel = await openProfile(page, 'Phạm Văn Cả');
  await panel.getByRole('button', { name: 'Thêm cha/mẹ' }).click();
  const dialog = page.getByRole('dialog', { name: 'Thêm cha/mẹ của Phạm Văn Cả' });
  await expect(
    dialog.getByRole('checkbox', { name: 'Đặt người này làm thuỷ tổ (đời thứ 1)' }),
  ).toBeChecked();
  await addPerson(page, 'Phạm Văn Tổ');
  await expect(cardOf(page, 'Phạm Văn Tổ')).toHaveAccessibleName(/đời thứ 1$/);
  await expect(cardOf(page, 'Phạm Văn Cả')).toHaveAccessibleName(/đời thứ 2$/);

  await cardOf(page, 'Phạm Văn Cả').focus();
  await page.keyboard.press('ArrowUp');
  await expect(cardOf(page, 'Phạm Văn Tổ')).toBeFocused();
});

test('asks before dropping unsaved profile changes', async ({ page }) => {
  const panel = await openProfile(page, 'Phạm Văn Cả');
  await panel.getByRole('button', { name: 'Sửa' }).click();
  await panel.getByLabel('Họ và tên').fill('Phạm Văn Cải');
  await page.keyboard.press('Escape');
  const ask = page.getByRole('dialog', { name: 'Bỏ các thay đổi trong hồ sơ?' });
  await ask.getByRole('button', { name: 'Ở lại sửa tiếp' }).click();
  await expect(panel.getByLabel('Họ và tên')).toHaveValue('Phạm Văn Cải');

  // Back closes the panel too, so it asks again.
  await page.goBack();
  await ask.getByRole('button', { name: 'Bỏ thay đổi' }).click();
  await expect(panel).toBeHidden();
  await expect(cardOf(page, 'Phạm Văn Cả')).toBeVisible();
});

test.describe('the card menu in a real browser', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'A pointer and keyboard menu check');
    await addChildren(page, 'Phạm Văn Cả', ['Phạm Văn Hai']);
  });

  test('choosing the progenitor with the mouse leaves focus on that card', async ({ page }) => {
    await cardOf(page, 'Phạm Văn Hai').click({ button: 'right' });
    const menu = page.getByRole('menu');
    await menu.getByRole('menuitem', { name: 'Chọn làm thuỷ tổ' }).click();
    await expect(menu).toBeHidden();
    // No dialog opens, so the menu itself puts focus back on the card, not on the page body.
    await expect(cardOf(page, 'Phạm Văn Hai')).toHaveAccessibleName('Phạm Văn Hai, đời thứ 1');
    await expect(cardOf(page, 'Phạm Văn Hai')).toBeFocused();
    await expect(page.locator('[data-person-open]:focus')).toHaveCount(1);
  });

  for (const key of ['Shift+F10', 'ContextMenu']) {
    test(`${key} opens the menu on the focused card, and Escape returns to it`, async ({
      page,
    }, testInfo) => {
      const card = cardOf(page, 'Phạm Văn Hai');
      await card.focus();
      await waitForViewToSettle(page);
      // Measured first: the open menu hides the rest of the page from the accessibility tree.
      const cardBox = await card.boundingBox();
      await page.keyboard.press(key);
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      await expect(menu.getByRole('menuitem').first()).toBeFocused();
      // Where the menu opens, for the report: not asserted.
      await testInfo.attach('positions', {
        body: JSON.stringify({ card: cardBox, menu: await menu.boundingBox() }),
        contentType: 'application/json',
      });
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(card).toBeFocused();
    });
  }
});

test.describe('quick arrows with the animation on', () => {
  test('on a phone, the focused card ends up fully on the board', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'A phone layout check');
    await addChildren(page, 'Phạm Văn Cả', CHILDREN);
    const board = page.getByRole('group', { name: BOARD });
    await expect(board).toBeVisible();

    const first = cardOf(page, CHILDREN[0]);
    await first.focus();
    await expectFullyOnBoard(page, first);

    // Two presses straight after each other: the second starts while the first still moves.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const third = cardOf(page, CHILDREN[2]);
    await expect(third).toBeFocused();
    await expectFullyOnBoard(page, third);

    // A held key: repeated key downs, then one key up.
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('ArrowRight');
    await page.keyboard.up('ArrowRight');
    const fifth = cardOf(page, CHILDREN[4]);
    await expect(fifth).toBeFocused();
    await expectFullyOnBoard(page, fifth);
  });
});

test.describe('with the profile open at 768 px', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('arrows keep the focused card on the board, and the panel covers nothing', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'A tablet-width layout check');
    await addChildren(page, 'Phạm Văn Cả', CHILDREN);
    const panel = await openProfile(page, 'Phạm Văn Cả');
    const board = page.getByRole('group', { name: BOARD });

    const first = cardOf(page, CHILDREN[0]);
    await first.focus();
    await expectFullyOnBoard(page, first);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const third = cardOf(page, CHILDREN[2]);
    await expect(third).toBeFocused();
    await expectFullyOnBoard(page, third);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const fifth = cardOf(page, CHILDREN[4]);
    await expect(fifth).toBeFocused();
    await expectFullyOnBoard(page, fifth);
    await page.keyboard.press('ArrowUp');
    await expect(cardOf(page, 'Phạm Văn Cả')).toBeFocused();
    await expectFullyOnBoard(page, cardOf(page, 'Phạm Văn Cả'));

    // The panel is a column beside the content: it covers neither the header controls nor
    // the board.
    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    for (const part of [
      page.getByRole('banner'),
      page.getByRole('navigation', { name: 'Mục của cây gia phả' }),
      page.getByRole('group', { name: 'Công cụ của cây' }),
      board,
    ]) {
      const box = await part.boundingBox();
      expect(box).not.toBeNull();
      if (panelBox !== null && box !== null) expect(overlaps(panelBox, box)).toBe(false);
    }
  });
});
