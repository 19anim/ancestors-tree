import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDndContext,
  useSensor,
  useSensors,
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Polaroid, tiltFor, type Point } from '../../shared/ui';
import { ChangeContext } from './ChangeRunner';
import { IDLE_DRAG, resetDrag, useDragStore } from './dragStore';
import { dropChange, pointerOf, zoneFor, zoneResults, type RectLike } from './dragZones';
import { lifeYears } from './format';
import { photoUrl } from './photoUrl';
import { blockMessage, changeSentence } from './relateText';
import { useTreeStore } from './store';

/** A mouse drag starts after the pointer moves this far with the button down (spec §7.6). */
export const MOUSE_DISTANCE = 6;
/** A long press picks a card up (spec §7.6 "Touch"); moving more first is a swipe. */
export const TOUCH_DELAY_MS = 400;
export const TOUCH_TOLERANCE = 8;

// dnd-kit measures the cards when a drag starts (its default) and then only when one mounts or
// resizes: a board that pans or zooms under the drag moves them without either, so the board
// has them measured again itself (TreeBoard's BoardDrag).

/**
 * Only the window scrolls by itself, near its top or bottom tenth: enough to reach the tray below
 * the board. Not sideways, and nothing inside the page (the board pans itself near its edges).
 */
const AUTO_SCROLL = {
  canScroll: (element: Element) => element === document.scrollingElement,
  threshold: { x: 0, y: 0.1 },
};
// The status line below speaks for the drag in the page's language; dnd-kit's own English
// announcements and instructions stay silent.
const SILENT = {
  announcements: {
    onDragStart: () => undefined,
    onDragMove: () => undefined,
    onDragOver: () => undefined,
    onDragEnd: () => undefined,
    onDragCancel: () => undefined,
  },
  screenReaderInstructions: { draggable: '' },
};

/**
 * The droppable under the pointer, among those with an area: a hidden one measures 0×0 at the
 * page's corner, where a pointer at that corner would otherwise be "within" it.
 */
const underPointer: CollisionDetection = (args) =>
  pointerWithin(args).filter(({ id }) => {
    const rect = args.droppableRects.get(id);
    return rect !== undefined && rect.width > 0 && rect.height > 0;
  });

function DragStatus() {
  const { t } = useTranslation();
  const activeId = useDragStore((state) => state.activeId);
  const overId = useDragStore((state) => state.overId);
  const zone = useDragStore((state) => state.zone);
  const results = useDragStore((state) => state.results);
  const tree = useTreeStore((state) => state.tree);
  const name = (id: string | null) =>
    (id === null ? undefined : tree.persons[id]?.fullName) ?? t('tree.relate.someone');
  let text = '';
  if (activeId !== null) {
    const result = zone === null ? undefined : results?.[zone];
    if (zone === null || result === undefined) {
      text = t('tree.drag.lifted', { name: name(activeId) });
    } else {
      const target =
        zone === 'tray'
          ? t('tree.drag.target.tray')
          : t(`tree.drag.target.${zone}`, { name: name(overId) });
      text =
        result.kind === 'ok'
          ? t('tree.drag.willDo', { change: changeSentence(t, tree, result.summary) })
          : result.kind === 'ask'
            ? t('tree.drag.willAsk', { target })
            : t('tree.drag.blocked', { target, reason: blockMessage(t, result.reason) });
    }
  }
  return (
    <p
      role="status"
      className={
        activeId === null
          ? 'sr-only'
          : 'pointer-events-none fixed inset-x-0 top-4 z-30 mx-auto w-fit max-w-xl rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink'
      }
    >
      {text}
    </p>
  );
}

/**
 * The lifted card, following the pointer (spec §7.6 "Starting a drag"): a board card at the
 * board's zoom, as it looked there; a loose photo as in the tray.
 */
function LiftedCard() {
  const activeId = useDragStore((state) => state.activeId);
  const liftZoom = useDragStore((state) => state.liftZoom);
  const person = useTreeStore((state) =>
    activeId === null ? undefined : state.tree.persons[activeId],
  );
  if (person === undefined) return null;
  return (
    // Lifted: a slight extra tilt and the lift shadow. Scaled from the corner, where dnd-kit
    // places the overlay on the card it came from. As wide as the photo, not the overlay (already
    // the card's width on screen), so the scaled shadow is the photo's size at any zoom.
    <div
      className="w-fit origin-top-left rotate-3 rounded-photo shadow-lift"
      style={liftZoom === null ? undefined : { scale: String(liftZoom) }}
    >
      <Polaroid
        aria-hidden="true"
        lod={liftZoom === null ? 'label' : 'full'}
        name={person.fullName}
        label={person.fullName}
        lifeYears={lifeYears(person)}
        photoUrl={photoUrl(person.photo, 'card')}
        tape="loose"
        tilt={tiltFor(person.id)}
      />
    </div>
  );
}

/** Puts the target and its zone in the drag store. */
function follow(overId: string | null, rect: RectLike | null, pointer: Point | null) {
  const state = useDragStore.getState();
  if (state.activeId === null) return;
  if (overId !== state.overId) {
    // A new target: plan its zones once, on the tree as it is now.
    const tree = useTreeStore.getState().tree;
    const results = zoneResults(tree, state.activeId, overId);
    const zone = pointer === null ? null : zoneFor(overId, state.activeId, pointer, rect, results);
    useDragStore.setState({ overId, zone, results, seenTree: tree });
    return;
  }
  const zone =
    pointer === null ? null : zoneFor(overId, state.activeId, pointer, rect, state.results);
  if (zone !== state.zone) useDragStore.setState({ zone });
}

type Rects = ReadonlyMap<UniqueIdentifier, ClientRect>;

/**
 * Keeps the target and zone in step with the real pointer and the cards' latest places. dnd-kit
 * re-renders this on a pointer move, after re-measuring the cards (the board moved: TreeBoard)
 * and on a scroll (its rects follow scrolling), so each of them re-checks the zone. Only a new
 * target plans the rules again.
 */
function DragTracker({ rects }: { rects: RefObject<Rects> }) {
  const { active, over, droppableRects } = useDndContext();
  const pointer = useDragStore((state) => state.pointer);
  useLayoutEffect(() => {
    rects.current = droppableRects;
  });
  useEffect(() => {
    if (active === null) return;
    const overId = over === null ? null : String(over.id);
    follow(overId, overId === null ? null : (droppableRects.get(overId) ?? null), pointer);
  });
  return null;
}

/** Drag to relate (spec §7.6), around the board and the tray. Viewers get no sensors. */
export function TreeDnd({ canEdit, children }: { canEdit: boolean; children: ReactNode }) {
  const requestChange = useContext(ChangeContext);
  const mouse = useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DISTANCE } });
  const touch = useSensor(TouchSensor, {
    activationConstraint: { delay: TOUCH_DELAY_MS, tolerance: TOUCH_TOLERANCE },
  });
  const sensors = useSensors(canEdit ? mouse : null, canEdit ? touch : null);
  const rects = useRef<Rects>(new Map());
  const lastPointer = useRef<Point | null>(null);
  const mounted = useRef(false);

  // The page went away mid-drag (another tree, signed out): no drag is left behind, and a late
  // drop does nothing.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Not resetDrag: no drop happened, so the next click is a click (and React's development
      // remount runs this too).
      useDragStore.setState(IDLE_DRAG);
    };
  }, []);

  // The real pointer, in client coordinates like the cards' rects: dnd-kit's own delta also
  // counts any scrolling since the drag started. Captured on the window, so it is known before
  // dnd-kit handles the same move. A finger counts from its touch: a long press may lift the card
  // without any move, and a browser stops sending pointer moves for a touch it takes over.
  useEffect(() => {
    if (!canEdit) return;
    const record = (x: number, y: number) => {
      const pointer = { x, y };
      lastPointer.current = pointer;
      const state = useDragStore.getState();
      if (state.activeId === null) return;
      if (state.pointer?.x === pointer.x && state.pointer.y === pointer.y) return;
      useDragStore.setState({ pointer });
    };
    const onMove = (event: MouseEvent) => record(event.clientX, event.clientY);
    const onTouch = (event: TouchEvent) => {
      const finger = event.touches[0];
      if (finger !== undefined) record(finger.clientX, finger.clientY);
    };
    const options = { capture: true, passive: true };
    window.addEventListener('pointermove', onMove, options);
    window.addEventListener('mousemove', onMove, options);
    window.addEventListener('touchstart', onTouch, options);
    window.addEventListener('touchmove', onTouch, options);
    return () => {
      window.removeEventListener('pointermove', onMove, options);
      window.removeEventListener('mousemove', onMove, options);
      window.removeEventListener('touchstart', onTouch, options);
      window.removeEventListener('touchmove', onTouch, options);
    };
  }, [canEdit]);

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    useDragStore.setState({
      ...IDLE_DRAG,
      activeId: String(active.id),
      pointer: lastPointer.current ?? pointerOf({ activatorEvent, delta: { x: 0, y: 0 } }),
      seenTree: useTreeStore.getState().tree,
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!mounted.current) return;
    const state = useDragStore.getState();
    const overId = event.over === null ? null : String(event.over.id);
    const tree = useTreeStore.getState().tree;
    const sameTarget = overId === state.overId;
    const results = sameTarget ? state.results : zoneResults(tree, state.activeId, overId);
    // The pointer's last place on the card's latest place decides the zone: the board may have
    // panned under it, or the page scrolled.
    const rect = overId === null ? null : (rects.current.get(overId) ?? event.over?.rect ?? null);
    const pointer = state.pointer ?? pointerOf(event);
    const zone = zoneFor(overId, state.activeId, pointer, rect, results);
    const change = dropChange(state.activeId, overId, zone);
    const activeId = state.activeId;
    const seenTree = (sameTarget ? state.seenTree : null) ?? tree;
    resetDrag();
    if (change === null || activeId === null || requestChange === null) return;
    requestChange({ change, focusPersonId: activeId, seenTree });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={underPointer}
      autoScroll={AUTO_SCROLL}
      accessibility={SILENT}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={resetDrag}
    >
      {children}
      <DragTracker rects={rects} />
      <DragStatus />
      <DragOverlay dropAnimation={null}>
        <LiftedCard />
      </DragOverlay>
    </DndContext>
  );
}
