"use client";
/**
 * Modal dialog on Radix (focus trap, Escape, focus return), styled to the 2020 layout:
 * centered rounded card on desktop, full-screen sheet on phones when `fullScreenMobile`.
 */
import { Dialog as R } from "radix-ui";
import { X, ArrowLeft } from "lucide-react";
import clsx from "clsx";
import type { ReactNode } from "react";
import { IconButton } from "./button";

export function Dialog({
  open,
  onOpenChange,
  title,
  hideTitle,
  children,
  headerAction,
  fullScreenMobile,
  width = 600,
  dismissible = true,
  back,
  description,
  className,
  closeLabel = "Close",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hideTitle?: boolean;
  children: ReactNode;
  headerAction?: ReactNode;
  fullScreenMobile?: boolean;
  width?: number;
  dismissible?: boolean;
  back?: () => void;
  description?: string;
  className?: string;
  closeLabel?: string;
}) {
  return (
    <R.Root open={open} onOpenChange={(o) => (dismissible || o ? onOpenChange(o) : undefined)}>
      <R.Portal>
        <R.Overlay className="motion-fade fixed inset-0 z-50 bg-overlay" />
        <R.Content
          onEscapeKeyDown={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          {...(description ? {} : { "aria-describedby": undefined })}
          className={clsx(
            "motion-pop fixed z-50 flex flex-col overflow-hidden bg-bg outline-none",
            "left-1/2 top-1/2 max-h-[90dvh] w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 rounded-card",
            fullScreenMobile &&
              "dialog-sheet max-sm:inset-0 max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none",
            className,
          )}
          style={{ maxWidth: width }}
        >
          {description && <R.Description className="sr-only">{description}</R.Description>}
          {!hideTitle ? (
            <div className="flex h-[53px] shrink-0 items-center gap-2 border-b border-line px-2">
              {dismissible &&
                (back ? (
                  <IconButton label="Back" onClick={back}>
                    <ArrowLeft size={20} />
                  </IconButton>
                ) : (
                  <R.Close asChild>
                    <IconButton label={closeLabel}>
                      <X size={20} />
                    </IconButton>
                  </R.Close>
                ))}
              <R.Title className="min-w-0 flex-1 truncate px-2 text-heading font-extrabold">{title}</R.Title>
              {headerAction}
            </div>
          ) : (
            <R.Title className="sr-only">{title}</R.Title>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </R.Content>
      </R.Portal>
    </R.Root>
  );
}

export function DialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("px-5 py-4", className)}>{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2 px-5 pb-5">{children}</div>;
}

/** Legacy confirmation card (e.g. "Delete Post?"). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  danger,
  busy,
  cancelLabel = "Cancel",
  secondary,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  danger?: boolean;
  busy?: boolean;
  cancelLabel?: string;
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <R.Root open={open} onOpenChange={onOpenChange}>
      <R.Portal>
        <R.Overlay className="motion-fade fixed inset-0 z-[60] bg-overlay" />
        <R.Content className="motion-pop fixed left-1/2 top-1/2 z-[60] w-[calc(100%-48px)] max-w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-card bg-bg p-8 outline-none">
          <R.Title className="text-heading font-bold">{title}</R.Title>
          <R.Description asChild>
            <div className="mt-2 text-post text-fg2">{body}</div>
          </R.Description>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className={clsx(
                "min-h-[44px] rounded-xl font-semibold disabled:opacity-50",
                danger ? "bg-danger text-white hover:bg-danger-hover" : "bg-accent text-accent-on hover:bg-accent-hover",
              )}
            >
              {busy ? "Working…" : confirmLabel}
            </button>
            {secondary && (
              <button type="button" onClick={secondary.onClick} className="min-h-[44px] rounded-xl border border-line-strong font-semibold hover:bg-hover-strong">
                {secondary.label}
              </button>
            )}
            <R.Close asChild>
              <button type="button" className="min-h-[44px] rounded-xl border border-line-strong font-semibold hover:bg-hover-strong">
                {cancelLabel}
              </button>
            </R.Close>
          </div>
        </R.Content>
      </R.Portal>
    </R.Root>
  );
}
