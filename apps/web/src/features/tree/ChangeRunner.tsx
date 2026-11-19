import type { Op, TreeState } from '@ancestors-tree/shared/tree';
import { X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button, type ButtonProps } from '../../shared/ui';
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
  /** The change was applied (not cancelled, blocked or out of date). */
  onDone?: (done: ChangeDone) => void;
  /**
   * The change, or its Undo, was not made: the toast's message, for an asker that shows it
   * itself (a dialog covers the toast).
   */
  onFailed?: (text: string) => void;
}

/** An applied change, for an asker that shows it itself (a dialog, which covers the toast). */
export interface ChangeDone {
  op: Op;
  /** The toast's sentence ("Đã đổi: …"). */
  text: string;
  /** The toast's Undo: undoes this change while it is the latest one, else does nothing. */
  undo: () => void;
}

export type RequestChange = (request: ChangeRequest) => void;

/** Null for viewers. Stable, so the cards do not re-render with the page. */
export const ChangeContext = createContext<RequestChange | null>(null);

type ToastContent =
  | { kind: 'done'; text: string; op: Op; request: ChangeRequest }
  | { kind: 'error'; text: string; request: ChangeRequest };

/** Each toast has its own id, so the same message twice is announced twice. */
type Toast = ToastContent & { id: number };

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
  const toastCount = useRef(0);
  const opener = useRef<HTMLElement | null>(null);

  const show = useCallback((content: ToastContent | null) => {
    toastCount.current += 1;
    setToast(content === null ? null : { ...content, id: toastCount.current });
  }, []);

  /**
   * Focus to the changed card, else back to what had focus, else the request's fallback, else
   * the main content. Also where focus goes when a toast control goes away while it has focus
   * (a shortcut's own fallback, ↶, may have taken it in between: the card wins).
   */
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

  /** Not made: the toast says why, and so does the asker. */
  const fail = useCallback(
    (request: ChangeRequest, text: string) => {
      show({ kind: 'error', text, request });
      request.onFailed?.(text);
    },
    [show],
  );

  /** Undoes the change while it is the latest one (spec §7.6 "Undo"); a failure is told. */
  const undoChange = useCallback(
    (op: Op, request: ChangeRequest) => {
      const store = useTreeStore.getState();
      if (store.undoStack.at(-1)?.op !== op) return;
      const result = store.undo();
      if (result !== null && !result.ok) {
        fail(request, t('tree.undo.failed', { reason: applyFailureMessage(t, result.reason) }));
      } else {
        show(null);
      }
    },
    [fail, show, t],
  );

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
        fail(request, t('tree.outOfDate'));
      } else if (decision.kind === 'blocked') {
        fail(request, t('tree.relate.failed', { reason: blockMessage(t, decision.reason) }));
      } else {
        const { op, summary } = decision;
        const applied = store.apply(op);
        if (applied.ok) {
          const text = t('tree.relate.toast', { change: changeSentence(t, before, summary) });
          show({ kind: 'done', text, op, request });
          request.onDone?.({ op, text, undo: () => undoChange(op, request) });
        } else {
          fail(
            request,
            t('tree.relate.failed', { reason: applyFailureMessage(t, applied.reason) }),
          );
        }
      }
      focusAfter(request);
    },
    [fail, focusAfter, show, t, undoChange],
  );

  const requestChange = useCallback<RequestChange>(
    (request) => {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement ? active : null;
      show(null);
      run(request, {}, request.seenTree ?? useTreeStore.getState().tree);
    },
    [run, show],
  );

  // The Undo button goes away with it; its focus moves on as for any control of the toast.
  const undo = () => {
    if (toast?.kind === 'done') undoChange(toast.op, toast.request);
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
      <ChangeToast
        toast={toast}
        onUndo={undo}
        onDismiss={() => show(null)}
        onFocusLost={focusAfter}
      />
    </>
  );
  return { requestChange, element };
}

function ChangeToast({
  toast,
  onUndo,
  onDismiss,
  onFocusLost,
}: {
  toast: Toast | null;
  onUndo: () => void;
  onDismiss: () => void;
  /** A control of this toast went away while it had focus (dismissed, or undone elsewhere). */
  onFocusLost: (request: ChangeRequest) => void;
}) {
  const { t } = useTranslation();
  const op = toast?.kind === 'done' ? toast.op : null;
  // The toast's Undo undoes this change only while it is the latest one (spec §7.6 "Undo"); a
  // boolean, so the selector is stable.
  const canUndo = useTreeStore((state) => op !== null && state.undoStack.at(-1)?.op === op);
  const request = toast?.request;
  const focusLost = request === undefined ? undefined : () => onFocusLost(request);
  // Over a bottom sheet (z-30) by z-index, and operable while the sheet makes the page inert
  // (inertOthers), so a change made from the sheet can be undone there. Dialogs (z-40 and z-50,
  // portalled after it) still cover it.
  return (
    <div
      data-stays-operable
      className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
    >
      <div
        className={
          toast === null
            ? 'sr-only'
            : 'pointer-events-auto flex max-w-xl items-center gap-3 rounded-control border border-line-strong bg-surface px-4 py-2'
        }
      >
        {/* Always in the accessibility tree, so each new message is announced; the message is
            keyed on the toast, so the same text again is a new node, announced again. An alert is
            announced as it appears, so it is there only with its message (as the page's own).
            aria-live is explicit: a modal dialog hides the page from screen readers except live
            regions marked so, and "Change relationship…" makes changes from a dialog. */}
        <p role="status" aria-live="polite" className="text-sm text-ink empty:sr-only">
          {toast?.kind === 'done' ? <span key={toast.id}>{toast.text}</span> : null}
        </p>
        {toast?.kind === 'error' ? (
          <p key={toast.id} role="alert" className="text-sm font-medium text-stamp">
            {toast.text}
          </p>
        ) : null}
        {canUndo ? (
          <HandOffButton
            onFocusLost={focusLost}
            variant="secondary"
            size="sm"
            aria-label={t('tree.relate.undoThis')}
            onClick={onUndo}
          >
            {t('tree.undo.label')}
          </HandOffButton>
        ) : null}
        {toast !== null ? (
          <HandOffButton
            onFocusLost={focusLost}
            variant="ghost"
            size="icon"
            aria-label={t('tree.relate.dismiss')}
            title={t('tree.relate.dismiss')}
            onClick={onDismiss}
          >
            <X aria-hidden="true" strokeWidth={1.75} className="size-4" />
          </HandOffButton>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A button that hands focus on when it goes away while holding it (WCAG 2.4.3), as the toast's
 * controls do: its unmount cleanup runs before React removes the button, so it can still tell.
 */
export function HandOffButton({
  onFocusLost,
  ...props
}: Omit<ButtonProps, 'ref'> & { onFocusLost: (() => void) | undefined }) {
  const ref = useRef<HTMLButtonElement>(null);
  const latest = useRef(onFocusLost);
  useLayoutEffect(() => {
    latest.current = onFocusLost;
  });
  useLayoutEffect(() => {
    const node = ref.current;
    return () => {
      if (node !== null && node === document.activeElement) latest.current?.();
    };
  }, []);
  return <Button ref={ref} {...props} />;
}
