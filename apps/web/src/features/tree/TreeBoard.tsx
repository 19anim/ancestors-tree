import { ReactFlow, ReactFlowProvider, useReactFlow, type Viewport } from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { Maximize, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button, useReducedMotion } from '../../shared/ui';
import {
  centredOn,
  firstNewPerson,
  isRectVisible,
  panned,
  pannedToShow,
  personRect,
} from './boardView';
import { toFlowElements, type FlowElements } from './flowElements';
import { layoutTree, type TreeLayout } from './layout';
import { PersonNode } from './PersonNode';
import { useTreeStore } from './store';
import { ThreadEdge } from './ThreadEdge';
import { UnionNode } from './UnionNode';

// Module constants: new objects on every render would make React Flow remount every node.
const nodeTypes = { person: PersonNode, union: UnionNode };
const edgeTypes = { thread: ThreadEdge };
const FIT_VIEW_OPTIONS = { maxZoom: 1, padding: 0.1 };

/** Where a reveal's animated move leaves the view, and until when it runs (`performance.now()`). */
interface Landing {
  viewport: Viewport;
  until: number;
}

/**
 * Shows a card at the current zoom when it is not fully on screen: centred (a card that gets
 * focus), or by the smallest pan (a new person), so the relative it was added from stays in view.
 * While an earlier reveal is still moving the view, "on screen" means where that move lands, not
 * where the view is mid-flight: two quick arrow presses must not leave the second card off
 * screen (WCAG 2.4.11).
 */
function useReveal(
  layout: TreeLayout,
  surface: RefObject<HTMLDivElement | null>,
  how: 'centre' | 'nearest',
  landing: RefObject<Landing | null>,
) {
  const { getViewport, setViewport } = useReactFlow();
  const reducedMotion = useReducedMotion();
  return useCallback(
    (personId: string) => {
      const rect = personRect(layout, personId);
      const element = surface.current;
      if (rect === null || element === null) return;
      const now = performance.now();
      const flight = landing.current;
      const viewport = flight !== null && now < flight.until ? flight.viewport : getViewport();
      const size = { width: element.offsetWidth, height: element.offsetHeight };
      const duration = reducedMotion ? 0 : 300;
      if (how === 'nearest') {
        const next = pannedToShow(rect, viewport, size);
        if (next === null) return;
        landing.current = { viewport: next, until: now + duration };
        void setViewport(next, { duration });
        return;
      }
      if (isRectVisible(rect, viewport, size)) return;
      // Not setCenter: it centres for React Flow's stored board size, which its ResizeObserver
      // updates a frame later. A card focused as the board narrows (the profile column opening)
      // would be centred for the old width, off the board. The size measured here decides both.
      const next = centredOn(rect, viewport.zoom, size);
      landing.current = { viewport: next, until: now + duration };
      void setViewport(next, { duration });
    },
    [getViewport, how, landing, layout, reducedMotion, setViewport, surface],
  );
}

/** Brings the first newly added person into view; removals leave the view alone. */
function RevealNewPeople({
  layout,
  reveal,
}: {
  layout: TreeLayout;
  reveal: (personId: string) => void;
}) {
  const seen = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    const previous = seen.current;
    seen.current = new Set(layout.persons.map((placed) => placed.id));
    if (previous === null) return; // The first render fits the whole tree instead.
    const added = firstNewPerson(previous, layout);
    if (added === null) return;
    const frame = requestAnimationFrame(() => reveal(added));
    return () => cancelAnimationFrame(frame);
  }, [layout, reveal]);
  return null;
}

function ZoomButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <Button variant="secondary" size="icon" aria-label={label} title={label} onClick={onClick}>
      <Icon aria-hidden="true" strokeWidth={1.75} className="size-5" />
    </Button>
  );
}

/**
 * The board narrowed or grew (the profile column opening beside it, the window resizing) while a
 * profile is open: React Flow keeps the view where it was, so the open person's card can end up
 * past the new edge. Focus is in the panel, so no focus reveal runs: the smallest pan brings the
 * card back (WCAG 2.4.11), through the same reveal and landing as the other moves.
 */
function useRevealOpenPersonOnResize(
  surface: RefObject<HTMLDivElement | null>,
  openPersonId: string | null,
  bringIntoView: (personId: string) => void,
) {
  const latest = useRef({ openPersonId, bringIntoView });
  useLayoutEffect(() => {
    latest.current = { openPersonId, bringIntoView };
  });
  useEffect(() => {
    const element = surface.current;
    if (element === null) return;
    let size = { width: element.offsetWidth, height: element.offsetHeight };
    const observer = new ResizeObserver(() => {
      const next = { width: element.offsetWidth, height: element.offsetHeight };
      if (next.width === size.width && next.height === size.height) return;
      size = next;
      const { openPersonId: personId, bringIntoView: reveal } = latest.current;
      if (personId !== null) reveal(personId);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [surface]);
}

interface BoardSurfaceProps {
  label: string;
  layout: TreeLayout;
  elements: FlowElements;
  openPersonId: string | null;
}

function BoardSurface({ label, layout, elements, openPersonId }: BoardSurfaceProps) {
  const { t } = useTranslation();
  const { getViewport, setViewport, zoomIn, zoomOut, fitView } = useReactFlow();
  const reducedMotion = useReducedMotion();
  const surface = useRef<HTMLDivElement>(null);
  const landing = useRef<Landing | null>(null);
  const reveal = useReveal(layout, surface, 'centre', landing);
  const bringIntoView = useReveal(layout, surface, 'nearest', landing);
  useRevealOpenPersonOnResize(surface, openPersonId, bringIntoView);
  const hintId = useId();
  const duration = reducedMotion ? 0 : 200;
  // The user moved the view: a reveal's landing no longer says where it will be.
  const userMoved = () => {
    landing.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Keys on a card's own button belong to the card (spec §7.8 reserves the arrows there).
    if (event.target !== event.currentTarget) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const next = panned(getViewport(), event.key);
    if (next !== null) void setViewport(next, { duration });
    else if (event.key === '+' || event.key === '=') void zoomIn({ duration });
    else if (event.key === '-') void zoomOut({ duration });
    else if (event.key === '0') void fitView({ ...FIT_VIEW_OPTIONS, duration });
    else return;
    userMoved();
    event.preventDefault();
  };

  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    const personId = event.target.closest('.react-flow__node')?.getAttribute('data-id');
    if (personId) reveal(personId);
  };

  return (
    <div
      ref={surface}
      role="group"
      aria-label={label}
      aria-describedby={hintId}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      className="board-grid relative h-[70vh] min-h-[420px] overflow-hidden rounded-control border border-line"
    >
      <p id={hintId} className="sr-only">
        {t('tree.board.keyboardHint')}
      </p>
      <ReactFlow
        nodes={elements.nodes}
        edges={elements.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        // Nodes and edges are decoration around the cards' own controls: no tab stops on them.
        nodesFocusable={false}
        edgesFocusable={false}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.2}
        maxZoom={2}
        // The small credit link keeps clear of the zoom buttons, which take the bottom right
        // (WCAG 2.5.8: a target under 24 px needs the space around it).
        attributionPosition="bottom-left"
        // A pointer or wheel move has an event; the reveals' own moves have none.
        onMoveStart={(event) => {
          if (event) userMoved();
        }}
      >
        <RevealNewPeople layout={layout} reveal={bringIntoView} />
      </ReactFlow>
      {/* After the cards in the DOM, so the tab order is board, cards, zoom buttons. */}
      <div className="absolute right-3 bottom-3 z-10 flex flex-col gap-2">
        <ZoomButton
          label={t('tree.board.zoomIn')}
          icon={ZoomIn}
          onClick={() => {
            userMoved();
            void zoomIn({ duration });
          }}
        />
        <ZoomButton
          label={t('tree.board.zoomOut')}
          icon={ZoomOut}
          onClick={() => {
            userMoved();
            void zoomOut({ duration });
          }}
        />
        <ZoomButton
          label={t('tree.board.fitView')}
          icon={Maximize}
          onClick={() => {
            userMoved();
            void fitView({ ...FIT_VIEW_OPTIONS, duration });
          }}
        />
      </div>
    </div>
  );
}

interface TreeBoardProps {
  label: string;
  /** The person whose profile is open: kept in view when the board's size changes. */
  openPersonId?: string | null;
}

export function TreeBoard({ label, openPersonId = null }: TreeBoardProps) {
  const { t } = useTranslation();
  const tree = useTreeStore((state) => state.tree);
  const layout = useMemo(() => layoutTree(tree), [tree]);
  const previous = useRef<FlowElements | undefined>(undefined);
  const elements = useMemo(() => toFlowElements(layout, previous.current), [layout]);
  useEffect(() => {
    previous.current = elements;
  }, [elements]);

  if (layout.persons.length === 0) {
    return <p className="text-ink-muted">{t('tree.board.noProgenitor')}</p>;
  }
  return (
    <ReactFlowProvider>
      <BoardSurface label={label} layout={layout} elements={elements} openPersonId={openPersonId} />
    </ReactFlowProvider>
  );
}
