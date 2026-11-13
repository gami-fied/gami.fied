'use client';

import React, { useState, useRef, useEffect, ReactNode, useId } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type DropdownVariant = 'orange' | 'emerald' | 'cyan' | 'rose';

export interface DropdownOption {
  value: string;
  label: string;
  sublabel?: string;
  icon?: ReactNode;
}

export interface DropdownProps {
  /** Use `right` near the right edge, so the menu stays on screen. */
  align?: 'left' | 'right';
  options: DropdownOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  actionLabel?: string;
  onActionClick?: () => void;
  className?: string;
  disabled?: boolean;
  theme?: DropdownVariant;
  variant?: DropdownVariant;
}

const variantStyles: Record<
  DropdownVariant,
  {
    arrowActive: string;
    selectedOption: string;
    checkIcon: string;
    actionButton: string;
  }
> = {
  orange: {
    arrowActive: 'text-brand-400',
    selectedOption: 'bg-brand-500/15 text-brand-400 font-semibold',
    checkIcon: 'text-brand-400',
    actionButton: 'text-brand-400 hover:bg-brand-950/40',
  },
  emerald: {
    arrowActive: 'text-success-400',
    selectedOption: 'bg-success-500/15 text-success-400 font-semibold',
    checkIcon: 'text-success-400',
    actionButton: 'text-success-400 hover:bg-success-950/40',
  },
  cyan: {
    arrowActive: 'text-info-400',
    selectedOption: 'bg-info-500/15 text-info-400 font-semibold',
    checkIcon: 'text-info-400',
    actionButton: 'text-info-400 hover:bg-info-950/40',
  },
  rose: {
    arrowActive: 'text-danger-400',
    selectedOption: 'bg-danger-500/15 text-danger-400 font-semibold',
    checkIcon: 'text-danger-400',
    actionButton: 'text-danger-400 hover:bg-danger-950/40',
  },
};

export function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  label,
  actionLabel,
  onActionClick,
  className,
  disabled = false,
  theme,
  variant,
  align = 'left',
}: DropdownProps) {
  const activeVariant: DropdownVariant = theme || variant || 'orange';
  const styles = variantStyles[activeVariant] || variantStyles.orange;

  const [isOpen, setIsOpen] = useState(false);
  const labelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      className={twMerge(clsx('relative inline-block w-full text-left', className))}
      ref={containerRef}
    >
      {label && (
        <span id={labelId} className="block text-xs font-medium text-zinc-300 mb-1.5">
          {label}
        </span>
      )}

      <button
        aria-labelledby={label ? labelId : undefined}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setIsOpen(false);
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const index = options.findIndex((option) => option.value === value);
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const next = options[(index + step + options.length) % options.length];
            if (next) onChange(next.value);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={label ?? placeholder}
        className={clsx(
          'w-full flex items-center justify-between gap-2 bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 text-zinc-100 text-xs font-medium rounded-none px-3 py-2 transition-colors aria-expanded:border-brand-500 disabled:opacity-50 disabled:cursor-not-allowed select-none'
        )}
      >
        <span className="truncate flex items-center gap-2">
          {selectedOption?.icon}
          {selectedOption ? (
            selectedOption.label
          ) : (
            <span className="text-zinc-400">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${
            isOpen ? `rotate-180 ${styles.arrowActive}` : ''
          }`}
        />
      </button>

        {isOpen && (
          <div
            className={`animate-pop absolute z-50 mt-1 min-w-[200px] ${align === 'right' ? 'right-0' : 'right-0 left-0'} bg-zinc-900 border border-zinc-800 rounded-none shadow-xl overflow-hidden py-1 max-h-60 overflow-y-auto`}>
            <div className="space-y-0.5 px-1">
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={clsx(
                      'w-full flex items-center justify-between px-3 py-2 text-xs rounded-none transition text-left font-medium',
                      isSelected
                        ? styles.selectedOption
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1 py-0.5">
                      {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="truncate text-zinc-100 font-medium leading-tight">{opt.label}</span>
                        {opt.sublabel && (
                          <span className="truncate text-xs text-zinc-400 font-normal leading-tight mt-0.5">
                            {opt.sublabel}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className={clsx('w-3.5 h-3.5 shrink-0 ml-2', styles.checkIcon)} />}
                  </button>
                );
              })}

              {options.length === 0 && (
                <div className="px-3 py-2.5 text-xs text-zinc-400 text-center">
                  No options available
                </div>
              )}
            </div>

            {actionLabel && onActionClick && (
              <div className="border-t border-zinc-800 mt-1 pt-1 px-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onActionClick();
                  }}
                  className={clsx(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-none transition text-left',
                    styles.actionButton
                  )}
                >
                  <span>{actionLabel}</span>
                </button>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
