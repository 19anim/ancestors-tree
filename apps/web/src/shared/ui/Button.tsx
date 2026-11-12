import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap transition-colors duration-(--duration-fast) ease-settle disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-ink text-paper hover:bg-ink/85',
        secondary: 'border border-line-strong bg-surface text-ink hover:bg-paper-grid',
        ghost: 'text-ink hover:bg-paper-grid',
        danger: 'bg-stamp text-on-stamp hover:bg-stamp/85',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the single child (for example a link) with button styles instead of a <button>. */
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type = 'button',
  ...props
}: ButtonProps) {
  const resolvedVariant = variant ?? 'primary';
  const resolvedSize = size ?? 'md';
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      data-variant={resolvedVariant}
      data-size={resolvedSize}
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant: resolvedVariant, size: resolvedSize }), className)}
      {...props}
    />
  );
}
