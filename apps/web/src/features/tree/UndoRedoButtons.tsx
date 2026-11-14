import { Redo2, Undo2, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui';
import { describeAction, describeOp, lookupIn, lookupWith } from './describeOp';
import { applyFailureMessage } from './format';
import {
  isMacPlatform,
  isTypingTarget,
  KEY_SHORTCUTS,
  shortcutAction,
  shortcutLabel,
  type ShortcutAction,
} from './shortcuts';
import { useTreeStore } from './store';

interface ToolbarButtonProps {
  label: string;
  tooltip: string;
  icon: LucideIcon;
  keyShortcuts: string;
  disabled: boolean;
  onClick: () => void;
}

const DISABLED_LOOK = 'aria-disabled:cursor-default aria-disabled:opacity-50';

/** An icon button whose tooltip (also its description) shows on hover and keyboard focus. */
function ToolbarButton({
  label,
  tooltip,
  icon: Icon,
  keyShortcuts,
  disabled,
  onClick,
}: ToolbarButtonProps) {
  const tooltipId = useId();
  // Esc hides the tooltip until focus leaves or comes back (WCAG 1.4.13).
  const [dismissed, setDismissed] = useState(false);
  return (
    <span className="group relative inline-flex">
      <Button
        variant="ghost"
        size="icon"
        className={DISABLED_LOOK}
        aria-label={label}
        aria-describedby={tooltipId}
        aria-keyshortcuts={keyShortcuts}
        aria-disabled={disabled ? 'true' : undefined}
        onClick={disabled ? undefined : onClick}
        onFocus={() => setDismissed(false)}
        onBlur={() => setDismissed(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDismissed(true);
        }}
      >
        <Icon aria-hidden="true" strokeWidth={1.75} className="size-5" />
      </Button>
      <span
        role="tooltip"
        id={tooltipId}
        className={`pointer-events-none absolute top-full left-1/2 z-10 mt-1 hidden -translate-x-1/2 rounded-control bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper ${dismissed ? '' : 'group-focus-within:block group-hover:block'}`}
      >
        {tooltip}
      </span>
    </span>
  );
}

/** ↶ and ↷ with the next undo named (spec §6.4). Editors only. */
export function UndoRedoButtons() {
  const { t } = useTranslation();
  // Objects already in the store: stable selector results.
  const nextUndo = useTreeStore((state) => state.undoStack.at(-1) ?? null);
  const nextRedo = useTreeStore((state) => state.redoStack.at(-1) ?? null);
  const undoStack = useTreeStore((state) => state.undoStack);
  const redoStack = useTreeStore((state) => state.redoStack);
  const hasUndo = nextUndo !== null;
  const hasRedo = nextRedo !== null;
  const tree = useTreeStore((state) => state.tree);
  const undo = useTreeStore((state) => state.undo);
  const redo = useTreeStore((state) => state.redo);
  // The message and the stacks it was raised on: a later change to either clears it.
  const [raised, setRaised] = useState<{
    message: string;
    undoStack: unknown;
    redoStack: unknown;
  } | null>(null);
  const failure =
    raised !== null && raised.undoStack === undoStack && raised.redoStack === redoStack
      ? raised.message
      : null;
  const mac = useMemo(isMacPlatform, []);

  const run = useCallback(
    (action: ShortcutAction) => {
      const result = action === 'undo' ? undo() : redo();
      if (result === null) return;
      const after = useTreeStore.getState();
      setRaised(
        result.ok
          ? null
          : {
              message: t(action === 'undo' ? 'tree.undo.failed' : 'tree.redo.failed', {
                reason: applyFailureMessage(t, result.reason),
              }),
              undoStack: after.undoStack,
              redoStack: after.redoStack,
            },
      );
    },
    [redo, t, undo],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = shortcutAction(event);
      if (action === null || isTypingTarget(event.target)) return;
      // Leave the key to the browser when there is nothing to do.
      if (action === 'undo' ? !hasUndo : !hasRedo) return;
      event.preventDefault();
      run(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasRedo, hasUndo, run]);

  const nextAction = nextUndo
    ? describeAction(t, describeOp(nextUndo.op, lookupWith(lookupIn(tree), [nextUndo.inverse])))
    : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToolbarButton
        label={t('tree.undo.label')}
        tooltip={t('tree.undo.tooltip', { shortcut: shortcutLabel('undo', mac) })}
        icon={Undo2}
        keyShortcuts={KEY_SHORTCUTS.undo}
        disabled={nextUndo === null}
        onClick={() => run('undo')}
      />
      <ToolbarButton
        label={t('tree.redo.label')}
        tooltip={t('tree.redo.tooltip', { shortcut: shortcutLabel('redo', mac) })}
        icon={Redo2}
        keyShortcuts={KEY_SHORTCUTS.redo}
        disabled={nextRedo === null}
        onClick={() => run('redo')}
      />
      {nextAction !== null ? (
        <span className="rounded-control bg-paper-grid px-2 py-1 text-sm text-ink-muted">
          {t('tree.undo.next', { action: nextAction })}
        </span>
      ) : null}
      {failure !== null ? (
        <p role="alert" className="text-sm font-medium text-stamp">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
