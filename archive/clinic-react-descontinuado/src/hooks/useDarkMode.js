import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'receptaai-dark-mode';

function getInitialMode() {
  // 1. Check localStorage
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored !== null) {
    return stored === 'true';
  }

  // 2. Check system preference
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  return false;
}

export function useDarkMode() {
  const [dark, setDark] = useState(getInitialMode);

  // Apply class to <html> element
  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY, String(dark));
  }, [dark]);

  // Listen for system preference changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    function handleChange(e) {
      // Only auto-switch if user hasn't manually set a preference
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) {
        setDark(e.matches);
      }
    }

    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const toggle = useCallback(() => setDark((prev) => !prev), []);

  return { dark, toggle };
}
