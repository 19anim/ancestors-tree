import { treeStateFromLists } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import i18n from '../../shared/i18n';
import { FAMILY, GRANDMA, GRANDPA, LOOSE, PARENTS_UNION, SON } from './fixtures';
import { blockMessage, changeSentence, questionText } from './relateText';

// The tests run in Vietnamese, as format.test.ts does.
const t = i18n.t;
const tree = treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);

describe('relate sentences', () => {
  it('says what a change does, with the names', () => {
    expect(
      changeSentence(t, tree, {
        kind: 'relate',
        effect: { relation: 'child', personId: LOOSE, targetId: GRANDPA, withId: GRANDMA },
      }),
    ).toBe('Trần Văn Bình thành con của Nguyễn Văn Tư và Lê Thị Hoa');
    expect(
      changeSentence(t, tree, { kind: 'cutThread', childId: SON, parentIds: [GRANDPA, GRANDMA] }),
    ).toBe('Nguyễn Văn Nam không còn là con của Nguyễn Văn Tư và Lê Thị Hoa');
    expect(changeSentence(t, tree, { kind: 'detach', personId: SON })).toBe(
      'Nguyễn Văn Nam chuyển vào Ảnh chưa dán',
    );
  });

  it('says why a change is blocked, for relate and server rules alike', () => {
    expect(blockMessage(t, 'ALREADY')).toBe('Quan hệ này đã có rồi.');
    expect(blockMessage(t, 'CYCLE')).toBe(
      'Thay đổi này sẽ khiến một người thành tổ tiên của chính mình.',
    );
  });

  it('words a question and its answers', () => {
    const text = questionText(
      t,
      tree,
      { kind: 'cutMarriage', unionId: PARENTS_UNION },
      { kind: 'keepChildren', partnerIds: [GRANDPA, GRANDMA] },
    );
    expect(text.title).toBe('Các con ở với ai?');
    expect(text.answers).toEqual([
      { label: 'Ở với Nguyễn Văn Tư', answers: { keepWith: GRANDPA } },
      { label: 'Ở với Lê Thị Hoa', answers: { keepWith: GRANDMA } },
    ]);
  });
});
