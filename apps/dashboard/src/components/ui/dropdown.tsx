'use client';

import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface DropdownOption {
  value: string;
  label: string;
  sublabel?: string;
  icon?: ReactNode;
}

export interface DropdownProps {
  options: DropdownOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  actionLabel?: string;
  onActionClick?: () => void;
  className?: string;
  disabled?: boolean;
}

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
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
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
      {label && <label className="block text-xs font-medium text-zinc-300 mb-1.5">{label}</label>}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 text-zinc-100 text-xs font-medium rounded-none px-3 py-2 transition focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed select-none"
      >
        <span className="truncate flex items-center gap-2">
          {selectedOption?.icon}
          {selectedOption ? (
            selectedOption.label
          ) : (
            <span className="text-zinc-500">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-orange-400' : ''
          }`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 4, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 left-0 z-50 mt-1 min-w-[200px] bg-zinc-900 border border-zinc-800 rounded-none shadow-xl overflow-hidden py-1 max-h-60 overflow-y-auto"
          >
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
                        ? 'bg-orange-500/15 text-orange-400 font-semibold'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100'
                    )}
                  >
                    <span className="flex items-center gap-2 truncate">
                      {opt.icon}
                      <span>{opt.label}</span>
                      {opt.sublabel && (
                        <span className="text-[10px] text-zinc-500 font-normal">
                          ({opt.sublabel})
                        </span>
                      )}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
                  </button>
                );
              })}

              {options.length === 0 && (
                <div className="px-3 py-2.5 text-xs text-zinc-500 text-center">
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
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-orange-400 hover:bg-orange-950/40 rounded-none transition text-left"
                >
                  <span>{actionLabel}</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
