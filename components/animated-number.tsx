"use client";
import { useEffect, useRef, useState } from 'react';

export function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    const start = current.current;
    if (start === value) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, began: number | undefined;
    const tick = (time: number) => {
      began ??= time;
      const progress = motion.matches ? 1 : Math.min((time - began) / 420, 1);
      current.current = Math.round(start + (value - start) * (1 - (1 - progress) ** 3));
      setDisplay(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span><span className="sr-only">{value}</span><span aria-hidden="true">{display}</span></span>;
}
