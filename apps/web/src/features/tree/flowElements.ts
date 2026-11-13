import type { Edge, Node } from '@xyflow/react';
import type { Point, TapeKind } from '../../shared/ui';
import { CARD, type TreeLayout } from './layout';

// React Flow needs `type` aliases (not interfaces) for node and edge data.
export type PersonNodeData = { personId: string; tape: TapeKind; generation: number };
export type UnionNodeData = { couple: boolean };
export type ThreadEdgeData = { from: Point; dropTo: number; to: Point };

export type PersonFlowNode = Node<PersonNodeData, 'person'>;
export type UnionFlowNode = Node<UnionNodeData, 'union'>;
export type TreeFlowNode = PersonFlowNode | UnionFlowNode;
export type ThreadFlowEdge = Edge<ThreadEdgeData, 'thread'>;

export interface FlowElements {
  nodes: TreeFlowNode[];
  edges: ThreadFlowEdge[];
}

export function unionNodeId(unionId: string): string {
  return `union-${unionId}`;
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function sameNode(a: TreeFlowNode, b: TreeFlowNode): boolean {
  if (a.type !== b.type || !samePoint(a.position, b.position)) return false;
  if (a.width !== b.width || a.height !== b.height) return false;
  const left = a.data as Record<string, unknown>;
  const right = b.data as Record<string, unknown>;
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function sameEdge(a: ThreadFlowEdge, b: ThreadFlowEdge): boolean {
  return (
    a.source === b.source &&
    a.target === b.target &&
    a.data !== undefined &&
    b.data !== undefined &&
    samePoint(a.data.from, b.data.from) &&
    a.data.dropTo === b.data.dropTo &&
    samePoint(a.data.to, b.data.to)
  );
}

/**
 * Nodes and edges for React Flow. Objects that did not change are reused from `previous`, so
 * React Flow and the memoised node components skip them (spec §7.4). Unions come first so the
 * cards are drawn on top of the stitches.
 */
export function toFlowElements(layout: TreeLayout, previous?: FlowElements): FlowElements {
  const oldNodes = new Map(previous?.nodes.map((node) => [node.id, node] as const));
  const oldEdges = new Map(previous?.edges.map((edge) => [edge.id, edge] as const));
  const keepNode = (node: TreeFlowNode): TreeFlowNode => {
    const old = oldNodes.get(node.id);
    return old && sameNode(old, node) ? old : node;
  };

  const nodes: TreeFlowNode[] = [
    ...layout.unions.map((union) =>
      keepNode({
        id: unionNodeId(union.id),
        type: 'union',
        position: { x: union.x, y: union.y },
        width: union.width,
        height: union.height,
        data: { couple: union.couple },
      }),
    ),
    ...layout.persons.map((person) =>
      keepNode({
        id: person.id,
        type: 'person',
        position: { x: person.x, y: person.y },
        width: CARD.width,
        height: CARD.height,
        data: { personId: person.id, tape: person.tape, generation: person.generation },
      }),
    ),
  ];

  const edges = layout.threads.map((thread): ThreadFlowEdge => {
    const edge: ThreadFlowEdge = {
      id: `thread-${thread.childId}`,
      type: 'thread',
      source: unionNodeId(thread.unionId),
      target: thread.childId,
      data: { from: thread.from, dropTo: thread.dropTo, to: thread.to },
    };
    const old = oldEdges.get(edge.id);
    return old && sameEdge(old, edge) ? old : edge;
  });

  return { nodes, edges };
}
