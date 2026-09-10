import type { ReactNode } from "react";

import { useInView } from "@/hooks/use-in-view";

export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section";
}) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <Tag
      ref={ref as never}
      className={`${inView ? "animate-in fade-in slide-in-from-bottom-6 duration-700 fill-mode-both" : "opacity-0"} ${className}`}
      style={inView ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
