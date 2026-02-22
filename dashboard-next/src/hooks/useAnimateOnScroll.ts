import { useRef, useState, useEffect } from 'react';

export function useAnimateOnScroll(options?: { threshold?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
        setProgress(entry.intersectionRatio);
      },
      { threshold: Array.from({ length: 20 }, (_, i) => i / 20), ...options }
    );

    const currentRef = ref.current;
    if (currentRef) observer.observe(currentRef);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, isVisible, progress };
}
