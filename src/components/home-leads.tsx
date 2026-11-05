"use client";

import { useEffect, useState } from "react";

export function HomeLeads({ lines }: { lines: readonly string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (lines.length < 2) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % lines.length);
    }, 5600);
    return () => window.clearInterval(timer);
  }, [lines]);

  const line = lines[index] ?? lines[0] ?? "";

  return (
    <p className="home-lead" aria-live="polite">
      <span key={`${index}-${line}`} className="home-lead__line drop-cap">
        {line}
      </span>
    </p>
  );
}
