"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type Variant = "primary" | "outline" | "danger" | "ghost" | "inverse" | "danger-outline" | "neutral";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
}

/** Legacy pill button. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "primary", size = "md", full, className, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        "inline-flex select-none items-center justify-center gap-1.5 rounded-xl font-semibold whitespace-nowrap transition-colors duration-150 disabled:opacity-50",
        size === "sm" && "min-h-[30px] px-[15px] text-sm",
        size === "md" && "min-h-[36px] px-4 text-post",
        size === "lg" && "min-h-[49px] px-8 text-post",
        full && "w-full",
        variant === "primary" && "bg-accent text-accent-on enabled:hover:bg-accent-hover",
        variant === "outline" && "border border-accent text-accent-text enabled:hover:bg-accent-soft",
        variant === "danger" && "bg-danger text-white enabled:hover:bg-danger-hover",
        variant === "danger-outline" && "border border-danger text-danger enabled:hover:bg-like-soft",
        variant === "ghost" && "text-accent-text enabled:hover:bg-accent-soft",
        variant === "neutral" && "border border-line-strong text-fg enabled:hover:bg-hover-strong",
        variant === "inverse" && "bg-fg text-bg enabled:hover:opacity-90",
        className,
      )}
      {...rest}
    />
  );
});

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: "accent" | "like" | "repost" | "neutral"; size?: number }
>(function IconButton({ label, tone = "accent", size = 36, className, children, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={rest.title ?? label}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-xl transition-colors duration-150 disabled:opacity-50",
        tone === "accent" && "text-accent-text enabled:hover:bg-accent-soft",
        tone === "neutral" && "text-fg enabled:hover:bg-hover-strong",
        tone === "like" && "enabled:hover:bg-like-soft enabled:hover:text-like",
        tone === "repost" && "enabled:hover:bg-repost-soft enabled:hover:text-repost",
        className,
      )}
      style={{ width: size, height: size, minWidth: size }}
      {...rest}
    >
      {children}
    </button>
  );
});
