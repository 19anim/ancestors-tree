import { Scissors } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useRef, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../shared/ui';

interface CutPopoverProps {
  /** What is cut ("Chỉ nối … với cha mẹ"): the popover's name. */
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCut: () => void;
  /**
   * Where focus goes when Escape closes the popover: the trigger is hidden from screen readers,
   * so a person's card beside it.
   */
  focusOnEscape: () => HTMLElement | null;
  /** The pin or knot button: pointer-only, so with tabIndex={-1}. */
  children: ReactElement;
}

/** "Cắt chỉ" beside a pin or a knot (spec §7.6). */
export function CutPopover({
  label,
  open,
  onOpenChange,
  onCut,
  focusOnEscape,
  children,
}: CutPopoverProps) {
  const { t } = useTranslation();
  const escaped = useRef(false);
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      {/* Pointer-only (spec §7.6): hidden from screen readers, as "Change relationship…" is the
          way without a pointer. On a wrapper, as a button hidden itself would have no name. */}
      <span aria-hidden="true">
        <Popover.Trigger asChild>{children}</Popover.Trigger>
      </span>
      <Popover.Portal>
        <Popover.Content
          aria-label={label}
          side="top"
          sideOffset={6}
          onOpenAutoFocus={() => {
            escaped.current = false;
          }}
          onEscapeKeyDown={() => {
            escaped.current = true;
          }}
          // The trigger is not a tab stop and is hidden from screen readers. After a cut the
          // runner places focus; after Escape a card beside the trigger gets it; a click
          // elsewhere leaves focus where it lands.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (escaped.current) focusOnEscape()?.focus();
          }}
          className="z-50 rounded-control border border-line bg-paper p-1 shadow-lift"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onCut();
            }}
          >
            <Scissors aria-hidden="true" strokeWidth={1.75} className="size-4" />
            {t('tree.cut.action')}
          </Button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
