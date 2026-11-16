import type { Op, TreeState } from '@ancestors-tree/shared/tree';
import { X } from 'lucide-react';
import { createContext, useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui';
import { decide, type Change, type ChangeAnswers, type ChangeQuestion } from './changes';
import { applyFailureMessage } from './format';
import { personCardButton } from './profileParams';
import { RelateQuestionDialog } from './RelateQuestionDialog';
import { blockMessage, changeSentence, questionText } from './relateText';
import { useTreeStore } from './store';

export interface ChangeRequest {
  change: Change;
  /** Focus goes to this person's card afterwards (a drop: card A, spec §7.6). */
  focusPersonId?: string;
  /**
   * Else back to what had focus; when that is gone (a removed row), here (a dialog's own
   * content); else the main content.
   */
  focusFallback?: () => HTMLElement | null;
  /** The tree the user saw the answer on (a drag's hover); defaults to the latest. */
  seenTree?: TreeState;
}

export type RequestChange = (request: ChangeRequest) => void;

/** Null for viewers. Stable, so the cards do not re-render with the page. */
export const ChangeContext = createContext<RequestChange | null>(null);

type Toast =
  { kind: 'done'; text: string; op: Op; request: ChangeRequest } | { kind: 'error'; text: string };

interface Asking {
  request: ChangeRequest;
  question: ChangeQuestion;
  answers: ChangeAnswers;
  /** The tree the question was asked on. */
  seen: TreeState;
}

/**
 * Runs a relationship change (spec §7.6): asks the follow-up questions, checks the answer again on
 * the latest tree, applies one op, and confirms it in a toast with Undo.
 */
export function useChangeRunner(): { requestChange: RequestChange; element: ReactNode } {
  const { t } = useTranslation();
  const [asking, setAsking] = useState<Asking | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const focusAfter = useCallback((request: ChangeRequest) => {
    // After React has drawn the change: the card may have moved, or into the tray.
    requestAnimationFrame(() => {
      const from = opener.current;
      const target =
        (request.focusPersonId === undefined ? null : personCardButton(request.focusPersonId)) ??
        (from?.isConnected ? from : null) ??
        request.focusFallback?.() ??
        document.querySelector<HTMLElement>('main');
      target?.focus();
    });
  }, []);

  const run = useCallback(
    (request: ChangeRequest, answers: ChangeAnswers, seen: TreeState) => {
      const store = useTreeStore.getState();
      const before = store.tree;
      const decision = decide(before, seen, request.change, answers);
      if (decision.kind === 'ask') {
        setAsking({ request, question: decision.question, answers, seen: before });
        return;
      }
      setAsking(null);
      if (decision.kind === 'outOfDate') {
        setToast({ kind: 'error', text: t('tree.outOfDate') });
      } else if (decision.kind === 'blocked') {
        setToast({
          kind: 'error',
          text: t('tree.relate.failed', { reason: blockMessage(t, decision.reason) }),
        });
      } else {
        const applied = store.apply(decision.op);
        setToast(
          applied.ok
            ? {
                kind: 'done',
                text: t('tree.relate.toast', {
                  change: changeSentence(t, before, decision.summary),
                }),
                op: decision.op,
                request,
              }
            : {
                kind: 'error',
                text: t('tree.relate.failed', { reason: applyFailureMessage(t, applied.reason) }),
              },
        );
      }
      focusAfter(request);
    },
    [focusAfter, t],
  );

  const requestChange = useCallback<RequestChange>(
    (request) => {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement ? active : null;
      setToast(null);
      run(request, {}, request.seenTree ?? useTreeStore.getState().tree);
    },
    [run],
  );

  const undo = () => {
    if (toast?.kind !== 'done') return;
    const result = useTreeStore.getState().undo();
    setToast(
      result !== null && !result.ok
        ? {
            kind: 'error',
            text: t('tree.undo.failed', { reason: applyFailureMessage(t, result.reason) }),
          }
        : null,
    );
    focusAfter(toast.request);
  };

  const question =
    asking === null ? null : questionText(t, asking.seen, asking.request.change, asking.question);
  const element = (
    <>
      {asking !== null && question !== null ? (
        <RelateQuestionDialog
          {...question}
          onAnswer={(answer) => run(asking.request, { ...asking.answers, ...answer }, asking.seen)}
          onCancel={() => {
            setAsking(null);
            focusAfter(asking.request);
          }}
        />
      ) : null}
      <ChangeToast toast={toast} onUndo={undo} onDismiss={() => setToast(null)} />
    </>
  );
  return { requestChange, element };
}

function ChangeToast({
  toast,
  onUndo,
  onDismiss,
}: {
  toast: Toast | null;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const op = toast?.kind === 'done' ? toast.op : null;
  // The toast's Undo undoes this change only while it is the latest one (spec §7.6 "Undo"); a
  // boolean, so the selector is stable.
  const canUndo = useTreeStore((state) => op !== null && state.undoStack.at(-1)?.op === op);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div
        className={
          toast === null
            ? 'sr-only'
            : 'pointer-events-auto flex max-w-xl items-center gap-3 rounded-control border border-line-strong bg-surface px-4 py-2'
        }
      >
        {/* Always in the accessibility tree, so each new message is announced. An alert is
            announced as it appears, so it is there only with its message (as the page's own). */}
        <p role="status" className="text-sm text-ink empty:sr-only">
          {toast?.kind === 'done' ? toast.text : ''}
        </p>
        {toast?.kind === 'error' ? (
          <p role="alert" className="text-sm font-medium text-stamp">
            {toast.text}
          </p>
        ) : null}
        {canUndo ? (
          <Button
            variant="secondary"
            size="sm"
            aria-label={t('tree.relate.undoThis')}
            onClick={onUndo}
          >
            {t('tree.undo.label')}
          </Button>
        ) : null}
        {toast !== null ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('tree.relate.dismiss')}
            title={t('tree.relate.dismiss')}
            onClick={onDismiss}
          >
            <X aria-hidden="true" strokeWidth={1.75} className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
