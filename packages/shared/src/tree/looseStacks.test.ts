import { describe, expect, it } from 'vitest';
import { looseStacks } from './looseStacks.ts';
import { makePerson, makeUnion, testId, treeOf } from './testing.ts';

describe('looseStacks', () => {
  it('groups a detached branch under its topmost person, and lone people alone', () => {
    const ROOT = testId(1);
    const TOP = testId(2);
    const TOP_WIFE = testId(3);
    const CHILD = testId(4);
    const LONE = testId(5);
    const tree = treeOf(
      [
        makePerson(ROOT, { fullName: 'An' }),
        makePerson(TOP, { fullName: 'Bảo' }),
        makePerson(TOP_WIFE, { fullName: 'Cúc', gender: 'female' }),
        makePerson(CHILD, { fullName: 'Dũng', parentUnionId: testId(101) }),
        makePerson(LONE, { fullName: 'Ánh' }),
      ],
      [makeUnion(testId(101), [TOP, TOP_WIFE])],
      ROOT,
    );
    expect(looseStacks(tree)).toEqual([
      { rootId: LONE, personIds: [LONE] },
      { rootId: TOP, personIds: [TOP, TOP_WIFE, CHILD] },
    ]);
  });

  it('leads with the person with the most descendants, even when another name comes first', () => {
    const AN = testId(1);
    const BINH = testId(2);
    const FIRST = testId(3);
    const SECOND = testId(4);
    const tree = treeOf(
      [
        makePerson(AN, { fullName: 'An', gender: 'female' }),
        makePerson(BINH, { fullName: 'Bình' }),
        makePerson(FIRST, { fullName: 'Cường', parentUnionId: testId(101) }),
        makePerson(SECOND, { fullName: 'Dương', parentUnionId: testId(102) }),
      ],
      [makeUnion(testId(101), [AN, BINH]), makeUnion(testId(102), [BINH], { order: 2 })],
    );
    expect(looseStacks(tree)).toEqual([{ rootId: BINH, personIds: [BINH, AN, FIRST, SECOND] }]);
  });

  it('puts members the walk down from the root does not reach last, by name', () => {
    const BAC = testId(1);
    const SON = testId(2);
    const CHI = testId(3);
    const DAUGHTER = testId(4);
    const tree = treeOf(
      [
        makePerson(BAC, { fullName: 'Bắc' }),
        makePerson(SON, { fullName: 'Đạt', parentUnionId: testId(101) }),
        makePerson(CHI, { fullName: 'Chi', gender: 'female' }),
        makePerson(DAUGHTER, { fullName: 'Én', gender: 'female', parentUnionId: testId(102) }),
      ],
      [
        makeUnion(testId(101), [BAC]),
        makeUnion(testId(102), [CHI]),
        makeUnion(testId(103), [SON, DAUGHTER]),
      ],
    );
    expect(looseStacks(tree)).toEqual([{ rootId: BAC, personIds: [BAC, SON, DAUGHTER, CHI] }]);
  });

  it('is empty when everyone is linked', () => {
    expect(looseStacks(treeOf([makePerson(testId(1))], [], testId(1)))).toEqual([]);
  });
});
