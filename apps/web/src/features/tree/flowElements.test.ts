import { describe, expect, it } from 'vitest';
import { toFlowElements, unionNodeId } from './flowElements';
import type { TreeLayout } from './layout';

const A = '000000000000000000000001';
const B = '000000000000000000000002';
const C = '000000000000000000000003';
const U = '000000000000000000000101';

const layout: TreeLayout = {
  persons: [
    { id: A, x: 0, y: 0, tape: 'progenitor', generation: 1 },
    { id: B, x: 148, y: 0, tape: 'in-law', generation: 1 },
    { id: C, x: 74, y: 234, tape: 0, generation: 2 },
  ],
  unions: [{ id: U, x: 100, y: 0, width: 48, height: 138, couple: true }],
  threads: [
    { childId: C, unionId: U, from: { x: 124, y: 69 }, dropTo: 146, to: { x: 124, y: 218 } },
  ],
  unlinked: [],
  width: 248,
  height: 372,
};

describe('toFlowElements', () => {
  it('makes union nodes first, then person nodes, and a thread edge per child', () => {
    const { nodes, edges } = toFlowElements(layout);
    expect(nodes.map((node) => node.id)).toEqual([unionNodeId(U), A, B, C]);
    expect(nodes[0]).toMatchObject({
      type: 'union',
      position: { x: 100, y: 0 },
      width: 48,
      height: 138,
      data: { couple: true },
      domAttributes: { 'aria-hidden': true },
    });
    expect(nodes[3]).toMatchObject({
      type: 'person',
      position: { x: 74, y: 234 },
      width: 100,
      height: 138,
      data: { personId: C, tape: 0, generation: 2 },
    });
    expect(edges).toEqual([
      {
        id: `thread-${C}`,
        type: 'thread',
        source: unionNodeId(U),
        target: C,
        data: { from: { x: 124, y: 69 }, dropTo: 146, to: { x: 124, y: 218 } },
        domAttributes: { 'aria-hidden': true },
      },
    ]);
  });

  it('reuses the objects of nodes and edges that did not change', () => {
    const first = toFlowElements(layout);
    const moved: TreeLayout = {
      ...layout,
      persons: layout.persons.map((p) => (p.id === B ? { ...p, x: 160 } : p)),
    };
    const second = toFlowElements(moved, first);
    expect(second.nodes[1]).toBe(first.nodes[1]);
    expect(second.nodes[2]).not.toBe(first.nodes[2]);
    expect(second.edges[0]).toBe(first.edges[0]);
  });
});
