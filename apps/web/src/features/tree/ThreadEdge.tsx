import type { EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { Thread } from '../../shared/ui';
import type { ThreadFlowEdge } from './flowElements';

/** Parent → child thread. The layout already knows the exact points, so handles are ignored. */
function ThreadEdgeComponent({ data }: EdgeProps<ThreadFlowEdge>) {
  if (!data) return null;
  return <Thread from={data.from} dropTo={data.dropTo} to={data.to} />;
}

export const ThreadEdge = memo(ThreadEdgeComponent);
