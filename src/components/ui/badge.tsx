import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const colorMap: Record<string, string> = {
  amber: "bg-amber-900/40 text-amber-300 border-amber-800",
  green: "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  blue: "bg-blue-900/40 text-blue-300 border-blue-800",
  red: "bg-red-900/40 text-red-300 border-red-800",
  purple: "bg-purple-900/40 text-purple-300 border-purple-800",
  zinc: "bg-zinc-800 text-zinc-300 border-zinc-700",
  pink: "bg-pink-900/40 text-pink-300 border-pink-800",
  cyan: "bg-cyan-900/40 text-cyan-300 border-cyan-800",
};

interface BadgeProps {
  children: ReactNode;
  color?: keyof typeof colorMap;
  className?: string;
}

export function Badge({ children, color = "zinc", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        colorMap[color] ?? colorMap.zinc,
        className
      )}
    >
      {children}
    </span>
  );
}
