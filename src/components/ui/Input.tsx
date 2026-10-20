"use client";
import * as React from "react";
import { cn } from "@/utils/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-9 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400",
          "focus:outline-hidden focus:border-navy-400 focus:ring-2 focus:ring-navy-200/60",
          "disabled:opacity-60",
          className
        )}
        {...props}
      />
    );
  }
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400",
          "focus:outline-hidden focus:border-navy-400 focus:ring-2 focus:ring-navy-200/60",
          "disabled:opacity-60",
          className
        )}
        {...props}
      />
    );
  }
);

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "text-2xs font-medium tracking-widest uppercase text-ink-500 block mb-1.5",
        className
      )}
      {...props}
    />
  );
}

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "h-9 w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900",
          "focus:outline-hidden focus:border-navy-400 focus:ring-2 focus:ring-navy-200/60",
          "disabled:opacity-60",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
