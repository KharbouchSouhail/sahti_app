import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none',
  {
    variants: {
      variant: {
        violet: 'bg-primary-100 text-primary-700',
        peach: 'bg-accent-100 text-accent-600',
        green: 'bg-[#E9F6F1] text-success',
        gray: 'bg-primary-50 text-ink-500',
        red: 'bg-[#FDECEC] text-danger',
        yellow: 'bg-[#FDF3DE] text-[#B47B12]',
        white: 'bg-white/15 text-white',
        outline: 'border border-line bg-white text-ink-500',
      },
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        md: '',
        lg: 'px-3 py-1.5 text-xs',
      },
    },
    defaultVariants: { variant: 'violet', size: 'md' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { badgeVariants };
