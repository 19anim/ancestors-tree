export const CLAN_ID = '64b7f0c2a1b2c3d4e5f60001';
export const TUAN_ID = '64b7f0c2a1b2c3d4e5f60002';
export const ME = {
  id: '64b7f0c2a1b2c3d4e5f60718',
  email: 'lan@example.test',
  name: 'Lan',
  locale: 'vi',
  hasPassword: true,
  hasGoogle: false,
};
export const CLAN = {
  id: CLAN_ID,
  name: 'Họ Nguyễn',
  hometown: 'Nam Định',
  description: '',
  role: 'owner',
  memberCount: 2,
  createdAt: '2026-11-13T08:00:00.000Z',
};
export const MEMBERS = [
  {
    userId: ME.id,
    name: 'Lan',
    email: 'lan@example.test',
    role: 'owner',
    joinedAt: '2026-11-13T08:00:00.000Z',
    isYou: true,
  },
  {
    userId: TUAN_ID,
    name: 'Tuấn',
    email: 'tuan@example.test',
    role: 'viewer',
    joinedAt: '2026-11-13T09:00:00.000Z',
    isYou: false,
  },
];
export const INVITE = {
  id: '64b7f0c2a1b2c3d4e5f60003',
  token: 'A'.repeat(32),
  role: 'viewer',
  createdByName: 'Lan',
  createdAt: '2026-11-13T08:00:00.000Z',
  expiresAt: '2026-11-20T08:00:00.000Z',
};
