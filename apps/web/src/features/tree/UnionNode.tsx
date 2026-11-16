import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo, useContext, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Stitch } from '../../shared/ui';
import { ChangeContext } from './ChangeRunner';
import { CutPopover } from './CutPopover';
import type { UnionFlowNode } from './flowElements';
import { personCardButton } from './profileParams';
import { names } from './relateText';
import { useTreeStore } from './store';

const HIDDEN_HANDLE: CSSProperties = { opacity: 0, pointerEvents: 'none' };

/**
 * A marriage: the stitch between two cards, or a knot under a parent drawn alone. A divorce is a
 * broken stitch. For editors, the knot opens "Cắt chỉ" (spec §7.6).
 */
function UnionNodeComponent({ data, width = 0, height = 0 }: NodeProps<UnionFlowNode>) {
  const { t } = useTranslation();
  const requestChange = useContext(ChangeContext);
  const [open, setOpen] = useState(false);
  const status = useTreeStore((state) => state.tree.unions[data.unionId]?.status);
  // The partners' names as one string: a stable selector value.
  const partners = useTreeStore((state) =>
    names(t, state.tree, state.tree.unions[data.unionId]?.partnerIds ?? []),
  );
  const firstPartner = useTreeStore(
    (state) => state.tree.unions[data.unionId]?.partnerIds[0] ?? null,
  );
  const focusPartner = () => (firstPartner === null ? null : personCardButton(firstPartner));
  return (
    <>
      <svg aria-hidden="true" width={width} height={height} className="overflow-visible">
        {data.couple ? (
          <Stitch
            left={{ x: 0, y: height / 2 }}
            right={{ x: width, y: height / 2 }}
            selected={open}
            broken={status === 'divorced'}
          />
        ) : (
          <circle cx={width / 2} cy={height / 2} r={4} className="fill-thread" />
        )}
      </svg>
      {requestChange === null ? null : (
        <CutPopover
          label={t('tree.cut.knot', { names: partners })}
          open={open}
          onOpenChange={setOpen}
          onCut={() =>
            requestChange({
              change: { kind: 'cutMarriage', unionId: data.unionId },
              focusPersonId: firstPartner ?? undefined,
            })
          }
          focusOnEscape={focusPartner}
        >
          <button
            type="button"
            // Pointer-only (spec §7.6): Remove in "Change relationship…" is the keyboard way.
            tabIndex={-1}
            aria-label={t('tree.cut.knot', { names: partners })}
            className="nodrag nopan absolute size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full"
            style={{ left: width / 2, top: height / 2, pointerEvents: 'auto' }}
          />
        </CutPopover>
      )}
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
