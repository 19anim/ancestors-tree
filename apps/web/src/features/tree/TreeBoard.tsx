import { ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { Maximize, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button, useReducedMotion } from '../../shared/ui';
import { firstNewPerson, isRectVisible, panned, pannedToShow, personRect } from './boardView';
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

/**
 * Shows a card at the current zoom when it is not fully on screen: centred (a card that gets
 * focus), or by the smallest pan (a new person), so the relative it was added from stays in view.
 */
function useReveal(
  layout: TreeLayout,
  surface: RefObject<HTMLDivElement | null>,
  how: 'centre' | 'nearest',
) {
  const { getViewport, setCenter, setViewport } = useReactFlow();
  const reducedMotion = useReducedMotion();
  return useCallback(
    (personId: string) => {
      const rect = personRect(layout, personId);
      const element = surface.current;
      if (rect === null || element === null) return;
      const viewport = getViewport();
      const size = { width: element.offsetWidth, height: element.offsetHeight };
      const duration = reducedMotion ? 0 : 300;
      if (how === 'nearest') {
        const next = pannedToShow(rect, viewport, size);
        if (next !== null) void setViewport(next, { duration });
        return;
      }
      if (isRectVisible(rect, viewport, size)) return;
      void setCenter(rect.x + rect.width / 2, rect.y + rect.height / 2, {
        zoom: viewport.zoom,
        duration,
      });
    },
    [getViewport, how, layout, reducedMotion, setCenter, setViewport, surface],
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

interface BoardSurfaceProps {
  label: string;
  layout: TreeLayout;
  elements: FlowElements;
}

function BoardSurface({ label, layout, elements }: BoardSurfaceProps) {
  const { t } = useTranslation();
  const { getViewport, setViewport, zoomIn, zoomOut, fitView } = useReactFlow();
  const reducedMotion = useReducedMotion();
  const surface = useRef<HTMLDivElement>(null);
  const reveal = useReveal(layout, surface, 'centre');
  const bringIntoView = useReveal(layout, surface, 'nearest');
  const hintId = useId();
  const duration = reducedMotion ? 0 : 200;

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
      >
        <RevealNewPeople layout={layout} reveal={bringIntoView} />
      </ReactFlow>
      {/* After the cards in the DOM, so the tab order is board, cards, zoom buttons. */}
      <div className="absolute right-3 bottom-3 z-10 flex flex-col gap-2">
        <ZoomButton
          label={t('tree.board.zoomIn')}
          icon={ZoomIn}
          onClick={() => void zoomIn({ duration })}
        />
        <ZoomButton
          label={t('tree.board.zoomOut')}
          icon={ZoomOut}
          onClick={() => void zoomOut({ duration })}
        />
        <ZoomButton
          label={t('tree.board.fitView')}
          icon={Maximize}
          onClick={() => void fitView({ ...FIT_VIEW_OPTIONS, duration })}
        />
      </div>
    </div>
  );
}

export function TreeBoard({ label }: { label: string }) {
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
      <BoardSurface label={label} layout={layout} elements={elements} />
    </ReactFlowProvider>
  );
}
