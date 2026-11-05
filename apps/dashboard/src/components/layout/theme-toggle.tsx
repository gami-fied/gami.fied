'use client';

import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const STORAGE_KEY = 'gami.theme';

/** Runs before the page paints, so a light-theme user never sees a dark flash. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${STORAGE_KEY}');if(t==='light'||(!t&&matchMedia('(prefers-color-scheme: light)').matches))document.documentElement.classList.add('light')}catch(e){}`;

export function ThemeToggle() {
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    setIsLight(document.documentElement.classList.contains('light'));
  }, []);

  const toggle = () => {
    const next = !isLight;
    document.documentElement.classList.toggle('light', next);
    localStorage.setItem(STORAGE_KEY, next ? 'light' : 'dark');
    setIsLight(next);
  };

  const label = isLight ? 'Switch to dark theme' : 'Switch to light theme';
  return (
    <button
      onClick={toggle}
      title={label}
      aria-label={label}
      className="p-2 text-zinc-400 hover:text-white transition"
    >
      {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </button>
  );
}
