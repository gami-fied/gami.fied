'use client';

import React, { useState } from 'react';
import { Check, Search, Square } from 'lucide-react';

export interface ChecklistItem<T extends string | number = string> {
  value: T;
  label: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
}

export interface ChecklistProps<T extends string | number = string> {
  items: ChecklistItem<T>[];
  selectedValues: T[];
  onChange: (newSelectedValues: T[]) => void;
  title?: string;
  showSelectAll?: boolean;
  showSearch?: boolean;
  searchPlaceholder?: string;
  maxHeight?: string;
  className?: string;
}

export function Checklist<T extends string | number = string>({
  items,
  selectedValues,
  onChange,
  title,
  showSelectAll = true,
  showSearch = false,
  searchPlaceholder = 'Filter items...',
  maxHeight = '240px',
  className = '',
}: ChecklistProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredItems = items.filter((item) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.label.toLowerCase().includes(term) ||
      (item.description && item.description.toLowerCase().includes(term)) ||
      String(item.value).toLowerCase().includes(term)
    );
  });

  const allFilteredSelected =
    filteredItems.length > 0 &&
    filteredItems.every((item) => selectedValues.includes(item.value));

  const handleToggle = (value: T, disabled?: boolean) => {
    if (disabled) return;
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      // Remove filtered items from selection
      const filteredValues = new Set(filteredItems.map((i) => i.value));
      onChange(selectedValues.filter((v) => !filteredValues.has(v)));
    } else {
      // Add all enabled filtered items to selection
      const newSet = new Set(selectedValues);
      filteredItems.forEach((i) => {
        if (!i.disabled) newSet.add(i.value);
      });
      onChange(Array.from(newSet));
    }
  };

  return (
    <div className={`border border-zinc-800 bg-zinc-950 font-mono text-xs rounded-none ${className}`}>
      {/* Header bar with counter and Select All */}
      {(title || showSelectAll || showSearch) && (
        <div className="flex flex-col gap-2 border-b border-zinc-800 bg-zinc-900/60 p-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {title && <span className="font-bold text-zinc-200 uppercase tracking-wider">{title}</span>}
              <span className="border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-emerald-400 font-mono">
                {selectedValues.length} / {items.length} selected
              </span>
            </div>

            {showSelectAll && items.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[10px] uppercase font-bold text-zinc-400 hover:text-emerald-400 transition-colors"
              >
                {allFilteredSelected ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          {showSearch && (
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full border border-zinc-800 bg-zinc-950 pl-7 pr-2 py-1 text-[11px] text-zinc-200 focus:border-emerald-500 focus:outline-none placeholder:text-zinc-600 rounded-none"
              />
            </div>
          )}
        </div>
      )}

      {/* Checklist items viewport */}
      <div
        className="overflow-y-auto divide-y divide-zinc-800/60"
        style={{ maxHeight }}
      >
        {filteredItems.length === 0 ? (
          <div className="p-4 text-center text-zinc-500 text-[11px]">
            No matching items found.
          </div>
        ) : (
          filteredItems.map((item) => {
            const isSelected = selectedValues.includes(item.value);
            return (
              <div
                key={String(item.value)}
                onClick={() => handleToggle(item.value, item.disabled)}
                className={`group flex items-start gap-3 p-2.5 transition-colors cursor-pointer select-none ${
                  item.disabled
                    ? 'opacity-40 cursor-not-allowed bg-zinc-950'
                    : isSelected
                    ? 'bg-emerald-950/20 text-emerald-200 hover:bg-emerald-950/30'
                    : 'text-zinc-300 hover:bg-zinc-900/50'
                }`}
              >
                {/* Checkbox box */}
                <div
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border transition-all rounded-none ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-600 text-white'
                      : 'border-zinc-700 bg-zinc-900 text-transparent group-hover:border-zinc-500'
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                </div>

                {/* Label & Description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-semibold text-xs truncate ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                      {item.label}
                    </span>
                    {item.badge && (
                      <span className="shrink-0 border border-zinc-700 bg-zinc-900 px-1 py-0.2 text-[9px] uppercase text-zinc-400">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="mt-0.5 text-[10px] text-zinc-400 leading-snug">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
