import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A person's card on the board or in the tray: its name starts with the person's name. */
export function cardOf(page: Page, name: string) {
  return page.getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}(,|$)`) });
}

/** Opens a person's profile panel; returns it. */
export async function openProfile(page: Page, name: string) {
  await cardOf(page, name).click();
  const panel = page.getByRole('complementary', { name });
  await expect(panel).toBeVisible();
  return panel;
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

/** Where in a card each drop zone is, as fractions of its box (spec §7.6). */
const ZONE_POINT = {
  top: { x: 0.5, y: 1 / 6 },
  middle: { x: 0.5, y: 0.5 },
  bottom: { x: 0.5, y: 5 / 6 },
  left: { x: 0.1, y: 0.5 },
  right: { x: 0.9, y: 0.5 },
} as const;

type DropZone = keyof typeof ZONE_POINT;

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('not on screen');
  return box;
}

/**
 * Where an element is once it stops moving: the board animates its view after a change (it
 * brings a new card into view), so a card measured too early is no longer there.
 */
export async function settledBox(locator: Locator) {
  let box = await boxOf(locator);
  let last = '';
  await expect
    .poll(
      async () => {
        box = await boxOf(locator);
        const now = JSON.stringify(box);
        const settled = now === last;
        last = now;
        return settled;
      },
      { intervals: [100] },
    )
    .toBe(true);
  return box;
}

function pointIn(box: { x: number; y: number; width: number; height: number }, where: DropZone) {
  const point = ZONE_POINT[where];
  return { x: box.x + box.width * point.x, y: box.y + box.height * point.y };
}

/** The drag's status line once the pointer is over a zone: what a drop would do. */
export function dropStatus(page: Page): Locator {
  return page.getByRole('status').filter({ hasText: /^(Thả để|.*: khi thả|.*: không được)/ });
}

/** The drag's status line while a card is lifted, over a zone or not. */
export function liftedStatus(page: Page): Locator {
  return page
    .getByRole('status')
    .filter({ hasText: /^(Đang kéo|Thả để|.*: khi thả|.*: không được)/ });
}

/** Drags one card onto a zone of another with the mouse (spec §7.6). */
export async function dragOnto(
  page: Page,
  from: Locator,
  to: Locator,
  where: DropZone,
): Promise<void> {
  await from.scrollIntoViewIfNeeded();
  const startAt = pointIn(await boxOf(from), 'middle');
  await page.mouse.move(startAt.x, startAt.y);
  await page.mouse.down();
  // Past the 6 px that start a drag, then on to the zone, measured once lifted: the target may
  // have moved since (the page scrolled).
  await page.mouse.move(startAt.x + 12, startAt.y, { steps: 3 });
  await expect(liftedStatus(page)).toBeVisible();
  const end = pointIn(await settledBox(to), where);
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await expect(dropStatus(page)).toBeVisible();
  await page.mouse.up();
}

/** The same with a finger: a long press, then a move (Chromium, through CDP). */
export async function longPressDrag(
  page: Page,
  from: Locator,
  to: Locator,
  where: DropZone,
): Promise<void> {
  await from.scrollIntoViewIfNeeded();
  const cdp = await page.context().newCDPSession(page);
  const start = pointIn(await boxOf(from), 'middle');
  const touchAt = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  try {
    await touchAt('touchStart', start.x, start.y);
    // No fixed sleep: the status line says when the card is lifted (after about 400 ms).
    await expect(liftedStatus(page)).toBeVisible();
    const end = pointIn(await settledBox(to), where);
    for (let step = 1; step <= 12; step += 1) {
      await touchAt(
        'touchMove',
        start.x + ((end.x - start.x) * step) / 12,
        start.y + ((end.y - start.y) * step) / 12,
      );
    }
    await expect(dropStatus(page)).toBeVisible();
    await touchAt('touchEnd', end.x, end.y);
  } finally {
    await cdp.detach();
  }
}
