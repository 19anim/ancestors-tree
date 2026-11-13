import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo, type CSSProperties } from 'react';
import type { PersonFlowNode } from './flowElements';
import { PersonCard } from './PersonCard';
import { useTreeStore } from './store';

/** Edges need a handle to attach to; nobody connects nodes by hand. */
const HIDDEN_HANDLE: CSSProperties = { opacity: 0, pointerEvents: 'none' };

function PersonNodeComponent({ data }: NodeProps<PersonFlowNode>) {
  // One person per selector: editing someone re-renders only their card.
  const person = useTreeStore((state) => state.tree.persons[data.personId]);
  if (!person) return null;
  return (
    <>
      <Handle type="target" position={Position.Top} isConnectable={false} style={HIDDEN_HANDLE} />
      <PersonCard person={person} tape={data.tape} generation={data.generation} />
    </>
  );
}

export const PersonNode = memo(PersonNodeComponent);
