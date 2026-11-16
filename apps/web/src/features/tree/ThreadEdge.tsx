import { EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { memo, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Thread, threadPath } from '../../shared/ui';
import { ChangeContext } from './ChangeRunner';
import { CutPopover } from './CutPopover';
import type { ThreadFlowEdge } from './flowElements';
import { personCardButton } from './profileParams';
import { names } from './relateText';
import { useTreeStore } from './store';

/** A target of at least 24 px around the pin (WCAG 2.5.8). */
const PIN_TARGET = 24;

/**
 * Parent → child thread. The layout already knows the exact points, so handles are ignored. For
 * editors, the thread and its pin open "Cắt chỉ" (spec §7.6).
 */
function ThreadEdgeComponent({ data, target }: EdgeProps<ThreadFlowEdge>) {
  const { t } = useTranslation();
  const requestChange = useContext(ChangeContext);
  const [open, setOpen] = useState(false);
  // A string, so the selector is stable.
  const name = useTreeStore((state) => names(t, state.tree, [target]));
  if (!data) return null;
  return (
    <>
      <Thread from={data.from} dropTo={data.dropTo} to={data.to} selected={open} />
      {requestChange === null ? null : (
        <>
          {/* A wide invisible stroke: the thread itself opens the same popover. */}
          <path
            data-cut-target="thread"
            d={threadPath(data.from, data.dropTo, data.to)}
            fill="none"
            stroke="transparent"
            strokeWidth={12}
            className="nopan cursor-pointer"
            style={{ pointerEvents: 'stroke' }}
            onClick={() => setOpen(true)}
          />
          <EdgeLabelRenderer>
            <CutPopover
              label={t('tree.cut.thread', { name })}
              open={open}
              onOpenChange={setOpen}
              onCut={() =>
                requestChange({
                  change: { kind: 'cutThread', childId: target },
                  focusPersonId: target,
                })
              }
              focusOnEscape={() => personCardButton(target)}
            >
              <button
                type="button"
                // Pointer-only (spec §7.6): Remove in "Change relationship…" is the keyboard way.
                tabIndex={-1}
                aria-label={t('tree.cut.thread', { name })}
                className="nodrag nopan absolute cursor-pointer rounded-full"
                style={{
                  width: PIN_TARGET,
                  height: PIN_TARGET,
                  transform: `translate(-50%, -50%) translate(${data.to.x}px, ${data.to.y}px)`,
                  pointerEvents: 'all',
                }}
              />
            </CutPopover>
          </EdgeLabelRenderer>
        </>
      )}
    </>
  );
}

export const ThreadEdge = memo(ThreadEdgeComponent);
