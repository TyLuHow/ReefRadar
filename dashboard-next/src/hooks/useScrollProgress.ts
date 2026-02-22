import { useState, useEffect, useCallback } from 'react';

export function useScrollProgress(): number {
  const [progress, setProgress] = useState(0);

  const handleScroll = useCallback(() => {
    let ticking = false;

    const update = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;

      if (docHeight <= 0) {
        setProgress(0);
        return;
      }

      const scrollProgress = Math.min(Math.max(scrollTop / docHeight, 0), 1);
      setProgress(scrollProgress);
      ticking = false;
    };

    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, []);

  useEffect(() => {
    // Set initial progress
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return progress;
}
