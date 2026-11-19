import { Palette } from 'lucide-react';
import { ContextMenu } from 'radix-ui';
import { useContext, useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { withDecorate } from './decor';
import { DecorateContext } from './decorContext';
import { personCardButton } from './profileParams';
import { useTreeStore } from './store';
import {
  ACTION_ICONS,
  actionLabelKey,
  PersonActionsContext,
  type PersonActionId,
} from './usePersonActions';

type MenuItemId = PersonActionId | 'decorate';

// No outline-none: the app's :focus-visible outline (styles/index.css) marks a keyboard-focused
// item, on the menu's paper in the gap around it, as the highlight alone is too faint.
const ITEM =
  'flex cursor-default items-center gap-2 rounded-control px-3 py-2 text-base select-none';
/**
 * The highlight is the ghost Button's hover (Button.tsx). Stamp on that background is under
 * 4.5:1, so a highlighted delete takes the danger Button's colors, as in the panel.
 */
const TONE = {
  plain: 'text-ink data-highlighted:bg-paper-grid',
  danger: 'text-stamp data-highlighted:bg-stamp data-highlighted:text-on-stamp',
};

/**
 * The right-click menu of a card (spec §7.6): the panel's actions, read when it opens, and
 * "Decorate this card…" (spec §13.4), which viewers get too.
 */
export function CardMenu({ personId, children }: { personId: string; children: ReactElement }) {
  const { t } = useTranslation();
  const api = useContext(PersonActionsContext);
  const decorate = useContext(DecorateContext);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MenuItemId[]>([]);
  // "Decorate this card…" waits for the menu to close: the panel focuses its heading when it
  // opens, and the menu's focus trap, still there while the menu unmounts, would take it back.
  const decorateOnClose = useRef(false);
  if (api === null && decorate === null) return children;
  return (
    <ContextMenu.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          const actions = api?.actionsFor(personId) ?? [];
          const known = useTreeStore.getState().tree.persons[personId] !== undefined;
          const menu = decorate !== null && known ? withDecorate(actions) : actions;
          // Nothing to offer (the person is gone): no empty menu.
          if (menu.length === 0) return;
          setItems(menu);
        }
        setOpen(next);
      }}
    >
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          // Radix would focus what had focus when the menu opened, often nothing after a
          // pointer right-click (WCAG 2.4.3). A dialog the item opened has focus by now and
          // keeps it; otherwise the card takes it.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (decorateOnClose.current) {
              decorateOnClose.current = false;
              // Synchronously, so the panel has focus before the fallback below looks.
              flushSync(() => decorate?.({ kind: 'card', personId }));
            }
            const active = document.activeElement;
            if (active === null || active === document.body) personCardButton(personId)?.focus();
          }}
          className="z-50 flex min-w-48 flex-col gap-1 rounded-control border border-line bg-paper p-1 shadow-lift"
        >
          {items.map((item) => {
            const Icon = item === 'decorate' ? Palette : ACTION_ICONS[item];
            return (
              <ContextMenu.Item
                key={item}
                className={`${ITEM} ${item === 'delete' ? TONE.danger : TONE.plain}`}
                onSelect={() => {
                  if (item === 'decorate') decorateOnClose.current = true;
                  else api?.run(personId, item);
                }}
              >
                <Icon aria-hidden="true" strokeWidth={1.75} className="size-4" />
                {item === 'decorate' ? t('tree.decor.card.open') : t(actionLabelKey(item))}
              </ContextMenu.Item>
            );
          })}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
