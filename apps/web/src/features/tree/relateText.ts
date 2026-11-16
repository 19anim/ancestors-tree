import { ALONE, type RelateBlock, type TreeState } from '@ancestors-tree/shared/tree';
import type { TFunction } from 'i18next';
import type { Change, ChangeAnswers, ChangeQuestion, ChangeSummary } from './changes';
import { ruleKey } from './format';

export interface QuestionText {
  title: string;
  description?: string;
  answers: { label: string; answers: ChangeAnswers }[];
}

const RELATE_BLOCKS = [
  'SAME_PERSON',
  'ALREADY',
  'IN_LAW_PARENT',
  'NOT_SIBLINGS',
  'TOO_MANY_SIBLINGS',
  'IS_PROGENITOR',
] as const;
type RelateOnlyBlock = (typeof RELATE_BLOCKS)[number];

function isRelateOnly(reason: RelateBlock): reason is RelateOnlyBlock {
  return (RELATE_BLOCKS as readonly string[]).includes(reason);
}

function nameOf(t: TFunction, tree: TreeState, id: string): string {
  return tree.persons[id]?.fullName ?? t('tree.relate.someone');
}

/** "A and B", or one name. */
function names(t: TFunction, tree: TreeState, ids: readonly string[]): string {
  const [first, second] = ids.map((id) => nameOf(t, tree, id));
  return second === undefined ? (first ?? '') : t('tree.relate.and', { a: first, b: second });
}

/** Why a change cannot be made, and what to do instead. */
export function blockMessage(t: TFunction, reason: RelateBlock): string {
  return isRelateOnly(reason) ? t(`tree.relate.blocked.${reason}`) : t(ruleKey(reason));
}

/** What a change does, in a sentence ("Lan thành con của Nam và Hoa"). */
export function changeSentence(t: TFunction, tree: TreeState, summary: ChangeSummary): string {
  const name = (id: string) => nameOf(t, tree, id);
  switch (summary.kind) {
    case 'relate': {
      const { relation, personId, targetId, withId } = summary.effect;
      const a = name(personId);
      const b = name(targetId);
      if (relation === 'child' && withId !== null) {
        return t('tree.relate.done.childWith', { a, b, with: name(withId) });
      }
      return t(`tree.relate.done.${relation}`, { a, b });
    }
    case 'cutThread':
      return t('tree.relate.done.notChildOf', {
        a: name(summary.childId),
        parents: names(t, tree, summary.parentIds),
      });
    case 'removeParent':
      return t('tree.relate.done.notChildOf', {
        a: name(summary.childId),
        parents: name(summary.parentId),
      });
    case 'cutMarriage': {
      const [a, b] = summary.partnerIds;
      return b === undefined
        ? t('tree.relate.done.cutAlone', { a: name(a ?? '') })
        : t('tree.relate.done.cutMarriage', { a: name(a ?? ''), b: name(b) });
    }
    case 'status': {
      const [a, b] = summary.partnerIds;
      return t('tree.relate.done.status', {
        a: name(a ?? ''),
        b: b === undefined ? '' : name(b),
        status: t(`tree.relate.status.${summary.status}`),
      });
    }
    case 'detach':
      return t('tree.relate.done.detach', { a: name(summary.personId) });
  }
}

/** A follow-up question and its answers; "Thôi, không đổi" is the dialog's own. */
export function questionText(
  t: TFunction,
  tree: TreeState,
  change: Change,
  question: ChangeQuestion,
): QuestionText {
  const name = (id: string) => nameOf(t, tree, id);
  const a = change.kind === 'relate' ? name(change.personId) : '';
  const b = change.kind === 'relate' ? name(change.targetId) : '';
  switch (question.kind) {
    case 'withWhom':
      return {
        title: t('tree.relate.ask.withWhom', { a, b }),
        answers: [
          ...question.unions.map(({ unionId, partnerId }) => ({
            label:
              partnerId === null
                ? t('tree.relate.ask.onlyOf', { b })
                : t('tree.relate.ask.withPartner', { b, partner: name(partnerId) }),
            answers: { union: unionId },
          })),
          ...(question.alone
            ? [{ label: t('tree.relate.ask.onlyOf', { b }), answers: { union: ALONE } }]
            : []),
        ],
      };
    case 'replaceParent':
      return {
        title: t('tree.relate.ask.replaceParent', { a, b }),
        answers: question.parentIds.map((id) => ({
          label: t('tree.relate.ask.replaces', { name: name(id) }),
          answers: { replaces: id },
        })),
      };
    case 'sharedChildren':
      return {
        title: t('tree.relate.ask.sharedChildren', {
          a,
          b,
          names: question.childIds.map(name).join(', '),
        }),
        answers: [
          { label: t('tree.relate.ask.shared'), answers: { shareChildren: true } },
          { label: t('tree.relate.ask.notShared'), answers: { shareChildren: false } },
        ],
      };
    case 'keepChildren':
      return {
        title: t('tree.relate.ask.keepChildren'),
        answers: question.partnerIds.map((id) => ({
          label: t('tree.relate.ask.keepWith', { name: name(id) }),
          answers: { keepWith: id },
        })),
      };
  }
}
