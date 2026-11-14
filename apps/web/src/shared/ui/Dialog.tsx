import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import { Button } from './Button';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps extends Omit<
  ComponentProps<typeof DialogPrimitive.Content>,
  'title'
> {
  /** Required so every dialog has an accessible name. */
  title: string;
  description?: string;
  /** Disables the corner close button (the caller also blocks Escape and Cancel). */
  closeDisabled?: boolean;
}

export function DialogContent({
  title,
  description,
  closeDisabled = false,
  className,
  children,
  ...props
}: DialogContentProps) {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 animate-overlay-in bg-scrim/45" />
      <DialogPrimitive.Content
        // Without a description, tell Radix there is intentionally none (no console warning).
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 animate-dialog-in rounded-control border border-line bg-surface p-6 text-ink',
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="pr-8 text-lg font-bold">{title}</DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-2 text-ink-muted">
            {description}
          </DialogPrimitive.Description>
        ) : null}
        <div className="mt-6">{children}</div>
        <DialogPrimitive.Close asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3 size-8"
            aria-label={t('common.close')}
            disabled={closeDisabled}
          >
            <X aria-hidden="true" size={16} strokeWidth={1.75} />
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
