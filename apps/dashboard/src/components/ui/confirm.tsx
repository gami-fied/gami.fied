'use client';

import React, { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmDialog } from './dialog';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  isDanger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

/** Lets any handler ask a question with `await confirmAction(...)`, like `confirm()` did. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((answer: boolean) => void) | null>(null);

  const confirmAction = useCallback<ConfirmFn>((next) => {
    setOptions(next);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirmAction}>
      {children}
      <ConfirmDialog
        isOpen={options !== null}
        onClose={() => answer(false)}
        onConfirm={() => answer(true)}
        title={options?.title ?? 'Are you sure?'}
        message={options?.message ?? ''}
        confirmText={options?.confirmText}
        isDanger={options?.isDanger ?? true}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error('useConfirm must be used within a ConfirmProvider');
  return value;
}
