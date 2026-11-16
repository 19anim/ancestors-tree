import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type HTMLAttributes,
  type PointerEvent,
  type SyntheticEvent,
} from 'react';
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
 * React Flow does not pan from inside a "nopan" element, and decides on the mousedown or
 * touchstart that follows a pointerdown. A mouse press on the card's button never pans the board
 * (it clicks or drags the card); a finger's swipe does, even from a card, as only a long press
 * lifts it (spec §7.6 "Touch"); so does a mouse press beside the button (on a tooltip). Set on
 * every press: the wrapper renders with "nopan", and React puts it back when the card is lifted
 * or put down.
 */
function keepMouseFromPanning(event: PointerEvent<HTMLDivElement>) {
  const target = event.target;
  const onButton = target instanceof HTMLElement && target.dataset.personOpen !== undefined;
  event.currentTarget.classList.toggle('nopan', onButton && event.pointerType !== 'touch');
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
  const wrapper = useRef<HTMLDivElement | null>(null);
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      wrapper.current = node;
      setDragNode(node);
      setDropNode(node);
    },
    [setDragNode, setDropNode],
  );
  // Once a finger has lifted the card, the board under it must not pan along (spec §7.6
  // "Touch"). A native listener, bubbling: after dnd-kit's own on the card's button (a touch's
  // events all go to where it started) and before React Flow's on the board. React's synthetic
  // events cannot stop it: React listens at the root, after the board has seen the event.
  useEffect(() => {
    const element = wrapper.current;
    if (element === null) return;
    const stop = (event: TouchEvent) => {
      if (useDragStore.getState().activeId !== null) event.stopPropagation();
    };
    element.addEventListener('touchmove', stop);
    return () => element.removeEventListener('touchmove', stop);
  }, []);
  const { listeners } = draggable;
  // A drag's listeners only, not its attributes: the card's button has its own role and name, and
  // "Change relationship…" stands in for dnd-kit's keyboard dragging. On the wrapper, so they do
  // not re-render the card; but only a press on the card's own button lifts it, not one on its
  // tooltip or in its menu (a portal, whose events bubble here through React). In the capture
  // phase: React Flow's board stops the propagation of a touch it may pan with, before React's
  // bubbling handlers at the root would see it; its capturing ones run first.
  const onButton = useMemo(
    () =>
      listeners === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(listeners).map(([name, listener]) => [
              `${name}Capture`,
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
    <div
      ref={ref}
      // No text selection or iOS callout on a long press: on touch it lifts the card.
      className={cn(
        className,
        'nopan select-none [-webkit-touch-callout:none]',
        lifted && 'opacity-40',
      )}
      onPointerDownCapture={keepMouseFromPanning}
      {...props}
      {...onButton}
    >
      {children}
    </div>
  );
}
