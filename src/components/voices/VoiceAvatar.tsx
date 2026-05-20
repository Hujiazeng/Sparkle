"use client";

import { useMemo } from "react";
import * as jdenticon from "jdenticon";
import { cn } from "@/lib/utils";

export function VoiceAvatar({
  name,
  className,
  size = 56,
}: {
  name: string;
  className?: string;
  size?: number;
}) {
  const svg = useMemo(
    () => jdenticon.toSvg(name || "voice", size),
    [name, size],
  );

  return (
    <span
      className={cn("block shrink-0 overflow-hidden rounded-full border border-border/70 bg-background", className)}
      style={{ width: size, height: size }}
      // jdenticon output is deterministic SVG based on the name.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
