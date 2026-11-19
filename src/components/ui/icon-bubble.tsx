import * as React from 'react';
import { cn } from '@/lib/utils';
import type { BubbleColor } from '@/lib/constants';

const colorMap: Record<BubbleColor, string> = {
  rose: 'bg-[#FDECE9] text-[#E0806F]',
  peach: 'bg-[#FDEBE3] text-accent-500',
  sky: 'bg-[#E9F1FD] text-[#5B8FCF]',
  violet: 'bg-primary-100 text-primary-600',
  mint: 'bg-[#E7F6F0] text-[#45A286]',
  yellow: 'bg-[#FDF4DE] text-[#D3A02A]',
};

const sizeMap = {
  sm: 'h-9 w-9 rounded-xl [&>svg]:h-4 [&>svg]:w-4',
  md: 'h-11 w-11 rounded-2xl [&>svg]:h-5 [&>svg]:w-5',
  lg: 'h-14 w-14 rounded-2xl [&>svg]:h-6 [&>svg]:w-6',
  xl: 'h-16 w-16 rounded-3xl [&>svg]:h-7 [&>svg]:w-7',
};

export function IconBubble({
  color = 'violet',
  size = 'md',
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { color?: BubbleColor; size?: keyof typeof sizeMap }) {
  return (
    <div className={cn('grid shrink-0 place-items-center', colorMap[color], sizeMap[size], className)} {...props}>
      {children}
    </div>
  );
}
