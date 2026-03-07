import { cn } from "@/lib/utils";
import { cloneElement, forwardRef, isValidElement, type ButtonHTMLAttributes, type ReactElement } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", asChild = false, children, ...props }, ref) => {
    const computedClassName = cn(
      "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:pointer-events-none disabled:opacity-50",
      {
        "bg-amber-600 text-white hover:bg-amber-500": variant === "primary",
        "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700": variant === "secondary",
        "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800": variant === "ghost",
        "bg-red-900/50 text-red-300 hover:bg-red-900": variant === "danger",
      },
      {
        "h-8 px-3 text-sm": size === "sm",
        "h-10 px-4 text-sm": size === "md",
        "h-12 px-6 text-base": size === "lg",
      },
      className
    );

    if (asChild && isValidElement(children)) {
      return cloneElement(children as ReactElement<{ className?: string }>, {
        className: cn(computedClassName, (children as ReactElement<{ className?: string }>).props?.className),
      });
    }

    return (
      <button ref={ref} className={computedClassName} {...props}>
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
