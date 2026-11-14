import { treeStateFromLists, type Op } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import i18n from '../../shared/i18n';
import { describeAction, describeOp, lookupIn, lookupWith } from './describeOp';
import { FAMILY, fixturePerson, GRANDMA, GRANDPA, LOOSE, PARENTS_UNION, SON } from './fixtures';

const NEW_ID = '64b7f0c2a1b2c3d4e5f6a0f1';
const NEW_UNION = '64b7f0c2a1b2c3d4e5f6b0f1';
const lookup = lookupIn(treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions));
const say = (op: Op) => describeAction(i18n.t, describeOp(op, lookup));

describe('describeOp', () => {
  it('names the people a change is about', () => {
    expect(say({ type: 'addPerson', payload: fixturePerson(NEW_ID, 'Nguyễn Văn Út') })).toBe(
      'thêm Nguyễn Văn Út',
    );
    expect(say({ type: 'updatePerson', payload: { id: SON, changes: { bio: 'x' } } })).toBe(
      'sửa thông tin của Nguyễn Văn Nam',
    );
    expect(say({ type: 'deletePerson', payload: { id: LOOSE } })).toBe('xoá Trần Văn Bình');
    expect(say({ type: 'setProgenitor', payload: { personId: GRANDPA } })).toBe(
      'chọn Nguyễn Văn Tư làm thuỷ tổ',
    );
    expect(say({ type: 'setProgenitor', payload: { personId: null } })).toBe('bỏ chọn thuỷ tổ');
    expect(
      say({ type: 'setParents', payload: { personId: LOOSE, parentUnionId: PARENTS_UNION } }),
    ).toBe('đặt Trần Văn Bình làm con của Nguyễn Văn Tư và Lê Thị Hoa');
    expect(say({ type: 'setParents', payload: { personId: SON, parentUnionId: null } })).toBe(
      'gỡ Nguyễn Văn Nam khỏi cha mẹ',
    );
    expect(say({ type: 'deleteUnion', payload: { id: PARENTS_UNION } })).toBe(
      'xoá cuộc hôn nhân của Nguyễn Văn Tư và Lê Thị Hoa',
    );
  });

  it('describes a batch by the one person it adds, or counts', () => {
    const spouse: Op = {
      type: 'batch',
      payload: {
        ops: [
          {
            type: 'addPerson',
            payload: fixturePerson(NEW_ID, 'Phạm Thị Lụa', { gender: 'female' }),
          },
          {
            type: 'addUnion',
            payload: { id: NEW_UNION, partnerIds: [SON, NEW_ID], order: 1, status: 'married' },
          },
        ],
      },
    };
    expect(say(spouse)).toBe('thêm Phạm Thị Lụa');
    const several: Op = {
      type: 'batch',
      payload: {
        ops: [
          { type: 'addPerson', payload: fixturePerson(NEW_ID, 'A') },
          { type: 'addPerson', payload: fixturePerson(NEW_UNION, 'B') },
        ],
      },
    };
    expect(say(several)).toBe('thêm 2 người');
    const mixed: Op = {
      type: 'batch',
      payload: {
        ops: [
          { type: 'updatePerson', payload: { id: SON, changes: { bio: 'x' } } },
          { type: 'setProgenitor', payload: { personId: GRANDMA } },
        ],
      },
    };
    expect(say(mixed)).toBe('2 thay đổi');
  });

  it('finds names in the ops themselves, and says "someone" when there is none', () => {
    const gone = fixturePerson(NEW_ID, 'Đỗ Văn Khoa');
    const restore: Op = { type: 'restorePerson', payload: { person: gone, unions: [] } };
    const remove: Op = { type: 'deletePerson', payload: { id: NEW_ID } };
    expect(describeAction(i18n.t, describeOp(remove, lookupWith(lookup, [restore])))).toBe(
      'xoá Đỗ Văn Khoa',
    );
    expect(say(remove)).toBe('xoá một người');
  });

  it('reads naturally when the union is unknown, in both languages', () => {
    const MISSING = '64b7f0c2a1b2c3d4e5f6b0ff';
    const en = i18n.getFixedT('en');
    const sayEn = (op: Op) => describeAction(en, describeOp(op, lookup));
    const orphan: Op = { type: 'setParents', payload: { personId: LOOSE, parentUnionId: MISSING } };
    const divorce: Op = { type: 'deleteUnion', payload: { id: MISSING } };
    expect(say(orphan)).toBe('đặt Trần Văn Bình làm con của cha mẹ');
    expect(sayEn(orphan)).toBe('make Trần Văn Bình a child of the parents');
    expect(say(divorce)).toBe('xoá cuộc hôn nhân của hai người');
    expect(sayEn(divorce)).toBe('delete the marriage of two people');
  });

  it('says "a set of changes" in English', () => {
    const mixed: Op = {
      type: 'batch',
      payload: {
        ops: [
          { type: 'updatePerson', payload: { id: SON, changes: { bio: 'x' } } },
          { type: 'setProgenitor', payload: { personId: GRANDMA } },
        ],
      },
    };
    expect(describeAction(i18n.getFixedT('en'), describeOp(mixed, lookup))).toBe(
      'a set of changes (2)',
    );
  });
});
