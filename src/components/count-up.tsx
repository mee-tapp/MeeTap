import { useEffect, useState } from "react";

import { useInView } from "@/hooks/use-in-view";

export function CountUp({
  value,
  duration = 1200,
  className,
}: {
  value: string;
  duration?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(0.4);
  const match = value.match(/^([\d.]+)(.*)$/);
  const numberPart = match?.[1];
  const target = numberPart !== undefined ? Number.parseFloat(numberPart) : null;
  const suffix = match?.[2] ?? "";
  const decimals = numberPart?.includes(".") ? (numberPart.split(".")[1]?.length ?? 0) : 0;
  const [display, setDisplay] = useState(
    target === null ? value : `${(0).toFixed(decimals)}${suffix}`,
  );

  useEffect(() => {
    if (!inView || target === null) return;
    let frame: number;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(`${(target * eased).toFixed(decimals)}${suffix}`);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, target, suffix, decimals, duration]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
