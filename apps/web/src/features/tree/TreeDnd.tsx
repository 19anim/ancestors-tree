import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Polaroid, tiltFor } from '../../shared/ui';
import { ChangeContext } from './ChangeRunner';
import { IDLE_DRAG, resetDrag, useDragStore } from './dragStore';
import { dropChange, pointerOf, zoneFor, zoneResults } from './dragZones';
import { blockMessage, changeSentence } from './relateText';
import { useTreeStore } from './store';

/** A mouse drag starts after the pointer moves this far with the button down (spec §7.6). */
export const MOUSE_DISTANCE = 6;

// The board re-measures cards while dragging: the edge pan moves them.
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } };
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

function LiftedCard() {
  const activeId = useDragStore((state) => state.activeId);
  const person = useTreeStore((state) =>
    activeId === null ? undefined : state.tree.persons[activeId],
  );
  if (person === undefined) return null;
  return (
    // Lifted: a slight extra tilt and the lift shadow (spec §7.6 "Starting a drag").
    <div className="rotate-3 rounded-photo shadow-lift">
      <Polaroid
        aria-hidden="true"
        lod="label"
        name={person.fullName}
        label={person.fullName}
        tape="loose"
        tilt={tiltFor(person.id)}
      />
    </div>
  );
}

/** Drag to relate (spec §7.6), around the board and the tray. Viewers get no sensors. */
export function TreeDnd({ canEdit, children }: { canEdit: boolean; children: ReactNode }) {
  const requestChange = useContext(ChangeContext);
  const mouse = useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DISTANCE } });
  const sensors = useSensors(canEdit ? mouse : null);

  const onDragStart = ({ active }: DragStartEvent) => {
    useDragStore.setState({
      ...IDLE_DRAG,
      activeId: String(active.id),
      seenTree: useTreeStore.getState().tree,
    });
  };

  // Also on a drag over: dnd-kit works out the target after the move that reached it, so a move
  // can still carry the previous target, and the over event brings the new one.
  const onDragMove = (event: DragMoveEvent) => {
    const state = useDragStore.getState();
    if (state.activeId === null) return;
    const pointer = pointerOf(event);
    const overId = event.over === null ? null : String(event.over.id);
    if (overId === state.overId) {
      const zone = zoneFor(
        overId,
        state.activeId,
        pointer,
        event.over?.rect ?? null,
        state.results,
      );
      useDragStore.setState({ pointer, zone });
      return;
    }
    // A new target: plan its zones once, on the tree as it is now.
    const tree = useTreeStore.getState().tree;
    const results = zoneResults(tree, state.activeId, overId);
    const zone = zoneFor(overId, state.activeId, pointer, event.over?.rect ?? null, results);
    useDragStore.setState({ pointer, overId, zone, results, seenTree: tree });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const state = useDragStore.getState();
    const overId = event.over === null ? null : String(event.over.id);
    const tree = useTreeStore.getState().tree;
    const sameTarget = overId === state.overId;
    const results = sameTarget ? state.results : zoneResults(tree, state.activeId, overId);
    // The pointer's last place decides the zone: the board may have panned under it.
    const zone = zoneFor(
      overId,
      state.activeId,
      pointerOf(event),
      event.over?.rect ?? null,
      results,
    );
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
      measuring={MEASURING}
      accessibility={SILENT}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragOver={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={resetDrag}
    >
      {children}
      <DragStatus />
      <DragOverlay dropAnimation={null}>
        <LiftedCard />
      </DragOverlay>
    </DndContext>
  );
}
