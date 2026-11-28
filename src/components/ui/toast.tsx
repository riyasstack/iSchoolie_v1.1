"use client";
/** Floating toast pills: spring in, fade out. Announced politely to assistive tech. */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";

interface Toast {
  id: number;
  text: string;
  action?: { label: string; href?: string; onClick?: () => void };
  tone?: "default" | "error";
  leaving?: boolean;
}

const Ctx = createContext<(t: Omit<Toast, "id" | "leaving">) => void>(() => {});

const EXIT_MS = 200;

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const show = useCallback((t: Omit<Toast, "id" | "leaving">) => {
    const id = ++seq.current;
    setToasts((prev) => [...prev.slice(-2), { ...t, id }]);
    const life = t.tone === "error" ? 6000 : 4000;
    // Play the exit animation first, then drop the toast.
    setTimeout(() => setToasts((prev) => prev.map((x) => (x.id === id ? { ...x, leaving: true } : x))), life - EXIT_MS);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), life);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--h-bottom-nav)+12px+env(safe-area-inset-bottom))] z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-5"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "pointer-events-auto flex max-w-[560px] items-center gap-4 rounded-2xl px-4 py-3 text-post shadow-[0_10px_34px_rgba(0,0,0,0.22)] backdrop-blur-xl",
              t.leaving ? "toast-out" : "toast-in",
              t.tone === "error" ? "bg-danger text-white" : "bg-accent/95 text-accent-on",
            )}
          >
            <span className="break-anywhere">{t.text}</span>
            {t.action &&
              (t.action.href ? (
                <Link href={t.action.href} className="shrink-0 font-bold underline-offset-2 hover:underline">
                  {t.action.label}
                </Link>
              ) : (
                <button type="button" className="shrink-0 font-bold hover:underline" onClick={t.action.onClick}>
                  {t.action.label}
                </button>
              ))}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
