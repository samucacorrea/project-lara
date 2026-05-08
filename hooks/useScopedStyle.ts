import { useEffect, useRef } from 'react';

export const useScopedStyle = (scopeKey: string, css: string | null) => {
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    if (!styleRef.current) {
      styleRef.current = document.createElement('style');
      styleRef.current.dataset.widgetScope = scopeKey;
      document.head.appendChild(styleRef.current);
    } else if (styleRef.current.dataset.widgetScope !== scopeKey) {
      document.head.removeChild(styleRef.current);
      styleRef.current = document.createElement('style');
      styleRef.current.dataset.widgetScope = scopeKey;
      document.head.appendChild(styleRef.current);
    }

    return () => {
      if (styleRef.current) {
        document.head.removeChild(styleRef.current);
        styleRef.current = null;
      }
    };
  }, [scopeKey]);

  useEffect(() => {
    if (!styleRef.current) return;
    if (!css) {
      styleRef.current.textContent = '';
      return;
    }
    styleRef.current.textContent = css;
  }, [css]);
};
