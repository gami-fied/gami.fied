import { useMemo, useState } from 'react';

export type SortDirection = 'ascending' | 'descending';

export interface SortState<K extends string> {
  key: K | null;
  direction: SortDirection;
  /** Sorts by this column, or turns the order round when it is already the sorted one. */
  toggle: (key: K) => void;
}

type Value = string | number | boolean | Date | null | undefined;

const compare = (a: Value, b: Value): number => {
  // Rows with nothing in the column go last, whichever way the rest is sorted.
  if (a === null || a === undefined || a === '') return b === null || b === undefined || b === '' ? 0 : 1;
  if (b === null || b === undefined || b === '') return -1;
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  return Number(a) - Number(b);
};

/**
 * Sorts rows that are already loaded, by the columns given. Until a column is chosen the rows keep
 * the order they came in.
 */
export function useSort<T, K extends string>(rows: T[], columns: Record<K, (row: T) => Value>): { sorted: T[]; sort: SortState<K> } {
  const [key, setKey] = useState<K | null>(null);
  const [direction, setDirection] = useState<SortDirection>('ascending');

  const sorted = useMemo(() => {
    if (!key) return rows;
    const read = columns[key];
    const blank = (value: Value) => value === null || value === undefined || value === '';
    return [...rows].sort((a, b) => {
      const result = compare(read(a), read(b));
      // Empty values stay last in both directions.
      return blank(read(a)) || blank(read(b)) || direction === 'ascending' ? result : -result;
    });
    // The column readers are plain functions made on every render, so they are left out on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, key, direction]);

  const toggle = (next: K) => {
    if (next === key) setDirection((current) => (current === 'ascending' ? 'descending' : 'ascending'));
    else {
      setKey(next);
      setDirection('ascending');
    }
  };

  return { sorted, sort: { key, direction, toggle } };
}
