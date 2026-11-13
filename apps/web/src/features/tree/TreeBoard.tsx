import { ReactFlow, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '../../shared/ui';
import { toFlowElements, type FlowElements } from './flowElements';
import { layoutTree } from './layout';
import { PersonNode } from './PersonNode';
import { useTreeStore } from './store';
import { ThreadEdge } from './ThreadEdge';
import { UnionNode } from './UnionNode';

// Module constants: new objects on every render would make React Flow remount every node.
const nodeTypes = { person: PersonNode, union: UnionNode };
const edgeTypes = { thread: ThreadEdge };
const FIT_VIEW_OPTIONS = { maxZoom: 1, padding: 0.1 };

/** Brings new people into view after they are added. */
function FitWhenPeopleChange({ count }: { count: number }) {
  const { fitView } = useReactFlow();
  const reducedMotion = useReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      void fitView({ ...FIT_VIEW_OPTIONS, duration: reducedMotion ? 0 : 300 });
    });
    return () => cancelAnimationFrame(frame);
  }, [count, fitView, reducedMotion]);
  return null;
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
    <div
      role="group"
      aria-label={label}
      className="board-grid h-[70vh] min-h-[420px] overflow-hidden rounded-control border border-line"
    >
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
      >
        <FitWhenPeopleChange count={layout.persons.length} />
      </ReactFlow>
    </div>
  );
}
