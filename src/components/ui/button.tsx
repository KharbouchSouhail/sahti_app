import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-ink-900 text-white shadow-pill hover:-translate-y-0.5 hover:bg-ink-700',
        violet: 'bg-primary-600 text-white shadow-soft hover:-translate-y-0.5 hover:bg-primary-700',
        soft: 'bg-primary-100 text-primary-700 hover:bg-primary-200',
        outline:
          'border border-primary-200 bg-white text-primary-700 hover:border-primary-300 hover:bg-primary-50',
        ghost: 'text-ink-500 hover:bg-primary-50 hover:text-primary-700',
        white: 'bg-white text-primary-700 shadow-soft hover:bg-primary-50',
        danger: 'bg-[#FDECEC] text-danger hover:bg-[#FBDCDC]',
        success: 'bg-[#E9F6F1] text-success hover:bg-[#D8F0E7]',
      },
      size: {
        sm: 'h-9 px-3.5 text-xs',
        md: 'h-11 px-5',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'h-10 w-10',
        iconSm: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
