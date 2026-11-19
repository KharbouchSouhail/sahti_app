'use client';

import { useRef, useState, type KeyboardEvent, type ClipboardEvent } from 'react';
import { cn } from '@/lib/utils';

const LENGTH = 8;

export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const chars = value.padEnd(LENGTH, ' ').slice(0, LENGTH).split('');

  function setChar(index: number, char: string) {
    const clean = char.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!clean) return;
    const next = value.padEnd(LENGTH, ' ').split('');
    next[index] = clean.slice(-1);
    const joined = next.join('').replace(/\s+$/g, '').replace(/ /g, '');
    // conserve les positions intermédiaires vides en compactant uniquement la fin
    const compact = next.join('').slice(0, LENGTH).replace(/ /g, '');
    onChange(compact);
    if (index < LENGTH - 1) refs.current[index + 1]?.focus();
    if (compact.length === LENGTH) onComplete?.(compact);
    return joined;
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (chars[index]?.trim()) {
        const next = value.split('');
        next.splice(index, 1);
        onChange(next.join('').slice(0, LENGTH));
      } else if (index > 0) {
        refs.current[index - 1]?.focus();
        const next = value.split('');
        next.splice(index - 1, 1);
        onChange(next.join('').slice(0, LENGTH));
      }
    }
    if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < LENGTH - 1) refs.current[index + 1]?.focus();
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData
      .getData('text')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, LENGTH);
    if (!pasted) return;
    onChange(pasted);
    refs.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
    if (pasted.length === LENGTH) onComplete?.(pasted);
  }

  return (
    <div dir="ltr" className={cn('flex items-center justify-center gap-1.5 sm:gap-2', className)}>
      {Array.from({ length: LENGTH }).map((_, index) => (
        <div key={index} className="flex items-center gap-1.5 sm:gap-2">
          {index === 4 ? <span className="mx-0.5 h-1 w-2 rounded-full bg-primary-200" /> : null}
          <input
            ref={(el) => {
              refs.current[index] = el;
            }}
            value={chars[index]?.trim() ?? ''}
            onChange={(e) => setChar(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={(e) => {
              setFocused(index);
              e.target.select();
            }}
            onBlur={() => setFocused(null)}
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
            inputMode="text"
            autoComplete="one-time-code"
            spellCheck={false}
            aria-label={`Character ${index + 1}`}
            maxLength={2}
            className={cn(
              'h-12 w-9 rounded-xl border bg-white text-center text-lg font-bold uppercase text-ink-900 shadow-sm outline-none transition-all sm:h-14 sm:w-11',
              focused === index
                ? 'border-primary-400 ring-4 ring-primary-100'
                : 'border-line hover:border-primary-200',
              disabled && 'bg-primary-50 text-ink-400',
            )}
          />
        </div>
      ))}
    </div>
  );
}
