import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useCallback, useContext, useMemo, type HTMLAttributes, type SyntheticEvent } from 'react';
import { cn } from '../../shared/lib/cn';
import { ChangeContext } from './ChangeRunner';
import { useDragStore } from './dragStore';

interface CardDragProps extends HTMLAttributes<HTMLDivElement> {
  personId: string;
  /** The card can be lifted (a board card, a loose stack's top photo). Editors only. */
  drag: boolean;
  /** The card takes drops (a board card). Editors only. */
  drop: boolean;
}

/**
 * A card's wrapper as dnd-kit sees it (spec §7.6): what is dragged, and what is dropped on. Its
 * own component: the drag context changes on every press and every new target, and this way only
 * the wrapper re-renders for it, not the card inside (its children are the same elements).
 */
export function CardDrag({ personId, drag, drop, className, children, ...props }: CardDragProps) {
  const canEdit = useContext(ChangeContext) !== null;
  const draggable = useDraggable({ id: personId, disabled: !drag || !canEdit });
  const droppable = useDroppable({ id: personId, disabled: !drop || !canEdit });
  const setDragNode = draggable.setNodeRef;
  const setDropNode = droppable.setNodeRef;
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      setDragNode(node);
      setDropNode(node);
    },
    [setDragNode, setDropNode],
  );
  const { listeners } = draggable;
  // A drag's listeners only, not its attributes: the card's button has its own role and name, and
  // "Change relationship…" stands in for dnd-kit's keyboard dragging. On the wrapper, so they do
  // not re-render the card; but only a press on the card's own button lifts it, not one on its
  // tooltip or in its menu (a portal, whose events bubble here through React).
  const onButton = useMemo(
    () =>
      listeners === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(listeners).map(([name, listener]) => [
              name,
              (event: SyntheticEvent) => {
                const target = event.target;
                if (target instanceof HTMLElement && target.dataset.personOpen === personId) {
                  (listener as (event: SyntheticEvent) => void)(event);
                }
              },
            ]),
          ),
    [listeners, personId],
  );
  const lifted = useDragStore((state) => state.activeId === personId);
  return (
    <div ref={ref} className={cn(className, lifted && 'opacity-40')} {...props} {...onButton}>
      {children}
    </div>
  );
}
