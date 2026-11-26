"use client";
/** Legacy bottom toast. Announced politely to assistive tech. */
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

interface Toast {
  id: number;
  text: string;
  action?: { label: string; href?: string; onClick?: () => void };
  tone?: "default" | "error";
}

const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const show = useCallback((t: Omit<Toast, "id">) => {
    const id = ++seq.current;
    setToasts((prev) => [...prev.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.tone === "error" ? 6000 : 4000);
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
            className={`motion-slide-up pointer-events-auto flex max-w-[560px] items-center gap-4 rounded-md px-4 py-3 text-post shadow-lg ${t.tone === "error" ? "bg-danger text-white" : "bg-accent text-accent-on"}`}
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
