'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useRef,
  useEffect,
} from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X, Layers } from 'lucide-react';
import { clsx } from 'clsx';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  isExiting?: boolean;
}

interface ToastContextType {
  toast: (options: { type?: ToastType; title: string; description?: string }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Approximate card height + spacing for stack expansion offset calculations
const CARD_EXPANDED_GAP = 68;

function ToastCard({
  item,
  index,
  isHovered,
  onDismiss,
}: {
  item: ToastItem;
  index: number;
  isHovered: boolean;
  onDismiss: (id: string) => void;
}) {
  const [isEntering, setIsEntering] = useState(true);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsEntering(false);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const isTop = index === 0;
  const isExiting = item.isExiting;

  let translateY = 0;
  let scale = 1;
  let opacity = 1;
  const zIndex = 30 - index;

  if (isEntering) {
    translateY = 32;
    scale = 0.92;
    opacity = 0;
  } else if (isHovered) {
    // Expanded stack layout offsets
    translateY = -index * CARD_EXPANDED_GAP;
    scale = 1;
    opacity = 1;
  } else if (!isTop) {
    // Collapsed stacked card layout offsets
    if (index === 1) {
      translateY = -12;
      scale = 0.95;
      opacity = 0.85;
    } else if (index === 2) {
      translateY = -24;
      scale = 0.9;
      opacity = 0.65;
    } else {
      translateY = -36;
      scale = 0.85;
      opacity = 0;
    }
  }

  return (
    <div
      style={{
        transform: isExiting
          ? 'translateX(100%) scale(0.9)'
          : `translateY(${translateY}px) scale(${scale})`,
        opacity: isExiting ? 0 : opacity,
        zIndex,
        transitionProperty:
          'transform, opacity, max-height, padding, margin, border-color, background-color',
        transitionDuration: '350ms',
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      className={clsx(
        'absolute bottom-0 right-0 w-full flex items-start gap-3 p-3.5 bg-zinc-900/95 border border-zinc-800 rounded-none shadow-2xl backdrop-blur-md overflow-hidden',
        (isEntering || isExiting) && 'pointer-events-none'
      )}
    >
      {item.type === 'success' && (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
      )}
      {item.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
      {item.type === 'warning' && (
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      )}
      {item.type === 'info' && <Info className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />}

      <div className="flex-1 min-w-0">
        <h4 className="text-xs font-semibold text-zinc-100 leading-snug">{item.title}</h4>
        {item.description && (
          <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{item.description}</p>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(item.id);
        }}
        className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 rounded-none shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isHovered, setIsHovered] = useState(false);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const removeToastImmediate = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timersRef.current.has(id)) {
      clearTimeout(timersRef.current.get(id));
      timersRef.current.delete(id);
    }
  }, []);

  const dismissToast = useCallback(
    (id: string) => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t)));
      setTimeout(() => {
        removeToastImmediate(id);
      }, 350);
    },
    [removeToastImmediate]
  );

  const addToast = useCallback(
    ({
      type = 'info',
      title,
      description,
    }: {
      type?: ToastType;
      title: string;
      description?: string;
    }) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastItem = { id, type, title, description, isExiting: false };

      setToasts((prev) => [newToast, ...prev]);

      const timer = setTimeout(() => {
        dismissToast(id);
      }, 5000);

      timersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  const success = useCallback(
    (title: string, description?: string) => addToast({ type: 'success', title, description }),
    [addToast]
  );
  const error = useCallback(
    (title: string, description?: string) => addToast({ type: 'error', title, description }),
    [addToast]
  );
  const info = useCallback(
    (title: string, description?: string) => addToast({ type: 'info', title, description }),
    [addToast]
  );
  const warning = useCallback(
    (title: string, description?: string) => addToast({ type: 'warning', title, description }),
    [addToast]
  );

  const activeCount = toasts.filter((t) => !t.isExiting).length;
  // Calculate dynamic container height when expanded on hover
  const containerHeight = isHovered ? Math.max(72, activeCount * CARD_EXPANDED_GAP) : 72;

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error, info, warning }}>
      {children}
      <div
        className="fixed bottom-5 right-5 z-50 max-w-sm w-full pointer-events-auto px-4 sm:px-0"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Collapsed Count Pill Indicator */}
        {activeCount > 1 && (
          <div
            className={clsx(
              'absolute -top-7 right-1 z-40 flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900/90 border border-zinc-800 rounded-none text-[11px] font-semibold text-zinc-300 shadow-md backdrop-blur-md transition-all duration-300',
              isHovered ? 'opacity-0 pointer-events-none' : 'opacity-100'
            )}
          >
            <Layers className="w-3 h-3 text-orange-400" />
            <span>+{activeCount - 1} more (hover to expand)</span>
          </div>
        )}

        <div
          style={{ height: `${containerHeight}px` }}
          className="relative transition-all duration-350 ease-out"
        >
          {toasts.map((t, index) => (
            <ToastCard
              key={t.id}
              item={t}
              index={index}
              isHovered={isHovered}
              onDismiss={dismissToast}
            />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
