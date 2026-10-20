"use client";
import * as React from "react";
import { cn } from "@/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "subtle" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary: "bg-navy-700 text-white hover:bg-navy-800 active:bg-navy-900",
  secondary: "bg-white text-ink-900 border border-ink-200 hover:bg-slatey-50",
  ghost: "bg-transparent text-ink-700 hover:bg-slatey-100",
  subtle: "bg-slatey-100 text-ink-800 hover:bg-slatey-200",
  danger: "bg-negative-500 text-white hover:bg-negative-600",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-md",
  md: "h-9 px-4 text-sm rounded-md",
  lg: "h-11 px-5 text-[15px] rounded-md",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", iconLeft, iconRight, loading, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-navy-300 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        VARIANT[variant],
        SIZE[size],
        className
      )}
      {...props}
    >
      {loading && <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />}
      {!loading && iconLeft}
      {children}
      {iconRight}
    </button>
  );
});
