import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo, type CSSProperties } from 'react';
import { Stitch } from '../../shared/ui';
import type { UnionFlowNode } from './flowElements';

const HIDDEN_HANDLE: CSSProperties = { opacity: 0, pointerEvents: 'none' };

/** A marriage: the stitch between two cards, or a knot under a parent drawn alone. */
function UnionNodeComponent({ data, width = 0, height = 0 }: NodeProps<UnionFlowNode>) {
  return (
    <>
      <svg aria-hidden="true" width={width} height={height} className="overflow-visible">
        {data.couple ? (
          <Stitch left={{ x: 0, y: height / 2 }} right={{ x: width, y: height / 2 }} />
        ) : (
          <circle cx={width / 2} cy={height / 2} r={4} className="fill-thread" />
        )}
      </svg>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        style={HIDDEN_HANDLE}
      />
    </>
  );
}

export const UnionNode = memo(UnionNodeComponent);
