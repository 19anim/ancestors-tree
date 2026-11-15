import { ContextMenu } from 'radix-ui';
import { useContext, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ACTION_ICONS,
  actionLabelKey,
  PersonActionsContext,
  type PersonActionId,
} from './usePersonActions';

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

/** The right-click menu of a card (spec §7.6): the panel's actions, read when it opens. */
export function CardMenu({ personId, children }: { personId: string; children: ReactElement }) {
  const { t } = useTranslation();
  const api = useContext(PersonActionsContext);
  const [items, setItems] = useState<PersonActionId[]>([]);
  if (api === null) return children;
  return (
    <ContextMenu.Root
      onOpenChange={(open) => {
        if (open) setItems(api.actionsFor(personId));
      }}
    >
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 flex min-w-48 flex-col gap-1 rounded-control border border-line bg-paper p-1 shadow-lift">
          {items.map((action) => {
            const Icon = ACTION_ICONS[action];
            return (
              <ContextMenu.Item
                key={action}
                className={`${ITEM} ${action === 'delete' ? TONE.danger : TONE.plain}`}
                onSelect={() => api.run(personId, action)}
              >
                <Icon aria-hidden="true" strokeWidth={1.75} className="size-4" />
                {t(actionLabelKey(action))}
              </ContextMenu.Item>
            );
          })}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
