import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn, initials } from '@/lib/utils';

const avatarVariants = cva(
  'relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold',
  {
    variants: {
      size: {
        xs: 'h-7 w-7 text-[10px]',
        sm: 'h-9 w-9 text-xs',
        md: 'h-11 w-11 text-sm',
        lg: 'h-14 w-14 text-base',
        xl: 'h-20 w-20 text-2xl',
        '2xl': 'h-24 w-24 text-3xl',
      },
      tone: {
        violet: 'bg-gradient-to-br from-primary-400 to-primary-700 text-white',
        peach: 'bg-gradient-to-br from-accent-300 to-accent-500 text-white',
        mint: 'bg-gradient-to-br from-[#8FD9BE] to-[#3F9C7E] text-white',
        sky: 'bg-gradient-to-br from-[#9CC8F5] to-[#5589C9] text-white',
        ink: 'bg-gradient-to-br from-ink-500 to-ink-900 text-white',
        soft: 'bg-primary-100 text-primary-700',
      },
    },
    defaultVariants: { size: 'md', tone: 'violet' },
  },
);

export interface AvatarProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof avatarVariants> {
  name: string;
  src?: string | null;
}

export function Avatar({ name, src, size, tone, className, ...props }: AvatarProps) {
  return (
    <div className={cn(avatarVariants({ size, tone }), className)} {...props}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </div>
  );
}
