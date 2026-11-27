"use client";
import Link from "next/link";
import clsx from "clsx";
import { DropdownMenu as DM } from "radix-ui";
import { useEffect, useId, useRef, useState, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { BadgeCheck, Lock } from "lucide-react";
import { Button } from "./button";
import { Spinner } from "./spinner";
import type { UserDTO } from "@/lib/types";
import { graphemeLength } from "@/lib/text";

// ---------------------------------------------------------------- Avatar
export function Avatar({ user, size = 48, className }: { user: Pick<UserDTO, "avatarUrl" | "displayName"> | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initial = user?.displayName?.trim()?.[0]?.toUpperCase() ?? "?";
  return (
    <span className={clsx("relative inline-block shrink-0 overflow-hidden rounded-full bg-subtle", className)} style={{ width: size, height: size }}>
      {user?.avatarUrl && !failed ? (
         
        <img src={user.avatarUrl} alt="" width={size} height={size} className="h-full w-full object-cover" onError={() => setFailed(true)} loading="lazy" decoding="async" />
      ) : (
        <span aria-hidden="true" className="grid h-full w-full place-items-center bg-line-strong font-bold text-white" style={{ fontSize: size * 0.42 }}>
          {initial}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- Names
export function DisplayName({ user, className }: { user: Pick<UserDTO, "displayName" | "isProtected" | "demoTeamBadge">; className?: string }) {
  return (
    <span className={clsx("inline-flex min-w-0 items-center gap-0.5 font-bold", className)}>
      <span className="truncate">{user.displayName}</span>
      {user.demoTeamBadge && (
        <span title="iSchoolie demo team account (fictional badge; not identity verification)" className="inline-flex shrink-0">
          <BadgeCheck size={17} className="text-accent-text" aria-label="Demo team account" />
        </span>
      )}
      {user.isProtected && <Lock size={14} className="shrink-0" aria-label="Protected account" />}
    </span>
  );
}

// ---------------------------------------------------------------- Menu
export function Menu({ trigger, children, align = "end", label }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" | "center"; label?: string }) {
  return (
    <DM.Root modal={false}>
      <DM.Trigger asChild aria-label={label}>
        {trigger}
      </DM.Trigger>
      <DM.Portal>
        <DM.Content
          align={align}
          sideOffset={4}
          collisionPadding={8}
          onClick={(e) => e.stopPropagation()}
          className="motion-fade z-[70] min-w-[220px] max-w-[min(384px,calc(100vw-16px))] overflow-hidden rounded-2xl border border-line bg-elevated p-1.5 outline-none"
          style={{ boxShadow: "var(--shadow)" }}
        >
          {children}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function MenuItem({ icon, children, onSelect, danger, disabled, href }: { icon?: ReactNode; children: ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean; href?: string }) {
  const cls = clsx(
    "flex min-h-[42px] cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2.5 text-post outline-none data-[highlighted]:bg-hover-strong data-[disabled]:cursor-default data-[disabled]:opacity-50",
    danger && "text-danger",
  );
  if (href)
    return (
      <DM.Item asChild disabled={disabled}>
        <Link href={href} className={cls} onClick={(e) => e.stopPropagation()}>
          {icon && <span className="shrink-0 text-fg2 [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>}
          <span className="min-w-0">{children}</span>
        </Link>
      </DM.Item>
    );
  return (
    <DM.Item disabled={disabled} onSelect={() => onSelect?.()} className={cls}>
      {icon && <span className={clsx("shrink-0 [&>svg]:h-[18px] [&>svg]:w-[18px]", danger ? "text-danger" : "text-fg2")}>{icon}</span>}
      <span className="min-w-0">{children}</span>
    </DM.Item>
  );
}

// ---------------------------------------------------------------- Form controls
export function TextField({
  label,
  value,
  onChange,
  max,
  error,
  multiline,
  rows = 3,
  countMode = "grapheme",
  hint,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max?: number;
  error?: string | null;
  multiline?: boolean;
  rows?: number;
  countMode?: "grapheme" | "none";
  hint?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement> & TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const id = useId();
  const len = countMode === "grapheme" ? graphemeLength(value) : value.length;
  const over = max !== undefined && len > max;
  return (
    <div className="px-4 py-3">
      <div className={clsx("rounded-xl border bg-transparent px-3 pt-1.5 transition-colors focus-within:border-accent-text", error || over ? "border-danger" : "border-line-strong")}>
        <div className="flex justify-between text-xs text-fg2">
          <label htmlFor={id}>{label}</label>
          {max !== undefined && (
            <span aria-live="off" className={over ? "text-danger" : ""}>
              {len} / {max}
            </span>
          )}
        </div>
        {multiline ? (
          <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="w-full resize-none bg-transparent pb-2 pt-1 text-post outline-none" aria-invalid={!!error || over} {...rest} />
        ) : (
          <input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent pb-2 pt-1 text-post outline-none" aria-invalid={!!error || over} {...rest} />
        )}
      </div>
      {hint && !error && <p className="mt-1 text-xs text-fg2">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-post">
          {label}
        </label>
        {description && <div className="mt-0.5 text-xs text-fg2">{description}</div>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx("relative mt-0.5 h-[24px] w-[42px] shrink-0 rounded-full transition-colors disabled:opacity-50", checked ? "bg-accent" : "bg-line-strong")}
      >
        <span className={clsx("absolute top-[2px] h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[20px]" : "translate-x-[2px]")} />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-post">
          {label}
        </label>
        {description && <div className="mt-0.5 text-xs text-fg2">{description}</div>}
      </div>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-[18px] w-[18px] shrink-0 accent-[var(--accent)]" />
    </div>
  );
}

// ---------------------------------------------------------------- Tabs (route-based)
export function RouteTabs({ tabs, active }: { tabs: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line px-3 py-2" aria-label="Tabs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          aria-current={t.key === active ? "page" : undefined}
          className={clsx("flex min-h-[38px] flex-1 items-center justify-center rounded-xl px-3 text-sm font-semibold transition-colors", t.key === active ? "bg-accent-soft text-accent-text" : "text-fg2 hover:bg-hover-strong hover:text-fg")}
        >
          <span className="relative flex h-full items-center whitespace-nowrap">
            {t.label}
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function ButtonTabs<K extends string>({ tabs, active, onChange, label }: { tabs: { key: K; label: string }[]; active: K; onChange: (k: K) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line px-3 py-2">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={t.key === active}
          onClick={() => onChange(t.key)}
          className={clsx("flex min-h-[38px] flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors", t.key === active ? "bg-accent-soft text-accent-text" : "text-fg2 hover:bg-hover-strong hover:text-fg")}
        >
          <span className="relative flex h-full items-center whitespace-nowrap">
            {t.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- States
export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-auto max-w-[400px] px-8 py-10 text-left">
      <h2 className="text-display font-extrabold break-anywhere">{title}</h2>
      {body && <div className="mt-2 text-fg2">{body}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-10 text-center" role="alert">
      <p className="text-fg2">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function LoadMore({ hasMore, loading, onLoad, error }: { hasMore: boolean; loading: boolean; onLoad: () => void; error?: string | null }) {
  if (error) return <ErrorState message={error} onRetry={onLoad} />;
  if (loading) return <Spinner className="py-6" />;
  if (!hasMore) return null;
  return <Sentinel onVisible={onLoad} />;
}

function Sentinel({ onVisible }: { onVisible: () => void }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const cb = useRef(onVisible);
  useEffect(() => {
    cb.current = onVisible;
  });
  useEffect(() => {
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && cb.current(), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [el]);
  return (
    <div ref={setEl} className="flex justify-center py-4">
      <button type="button" onClick={onVisible} className="text-accent-text hover:underline">
        Show more
      </button>
    </div>
  );
}

export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <h2 className="text-heading font-extrabold">{children}</h2>
      {action}
    </div>
  );
}
