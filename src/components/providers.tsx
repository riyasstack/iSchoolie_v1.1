"use client";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { get, post, ApiError, SESSION_EVENT } from "@/lib/api";
import type { PreferencesDTO, SessionDTO } from "@/lib/types";
import { ToastProvider } from "./ui/toast";
import { useRealtimeConnected } from "@/features/realtime";
import { Dialog, DialogBody, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 30 * 60_000,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

const SessionContext = createContext<SessionDTO | null>(null);

export function useSession(): SessionDTO {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionGate");
  return s;
}

export function useOptionalSession(): SessionDTO | null {
  return useContext(SessionContext);
}

export function usePreferences(): PreferencesDTO {
  return useSession().preferences;
}

/** Applies display preferences to <html> so CSS tokens switch everywhere. */
export function applyPreferences(p: Pick<PreferencesDTO, "theme" | "accent" | "fontScale" | "reducedMotion">) {
  const el = document.documentElement;
  el.dataset.theme = p.theme;
  el.dataset.accent = p.accent;
  el.dataset.reducedMotion = String(p.reducedMotion);
  el.style.setProperty("--font-scale", String(p.fontScale));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", p.theme === "DIM" ? "#15202b" : p.theme === "LIGHTS_OUT" ? "#000000" : "#ffffff");
}

export function SessionGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [expired, setExpired] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  const realtime = useRealtimeConnected();
  const session = useQuery({ queryKey: ["session"], queryFn: () => get<SessionDTO>("/session"), staleTime: 60_000 });
  const badges = useQuery({
    queryKey: ["badges"],
    queryFn: () => get<SessionDTO["badges"]>("/session/badges"),
    enabled: !!session.data,
    // Realtime events invalidate badges immediately; polling is only a fallback.
    refetchInterval: () => (typeof document !== "undefined" && document.visibilityState === "visible" ? (realtime ? 120_000 : 30_000) : false),
  });

  useEffect(() => {
    const onExpired = () => setExpired(true);
    window.addEventListener(SESSION_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EVENT, onExpired);
  }, []);

  useEffect(() => {
    if (session.data) applyPreferences(session.data.preferences);
  }, [session.data]);

  const restart = async () => {
    setRestarting(true);
    setRestartError(null);
    try {
      await post("/session/start");
      qc.clear();
      // Full reload on purpose: drops every viewer-scoped cache and in-flight poll of the previous actor.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/home");
    } catch (e) {
      setRestartError(e instanceof ApiError ? e.message : "Couldn’t start a new demo session.");
      setRestarting(false);
    }
  };

  if (session.isPending) return <AppLoading />;
  if (session.isError && !expired) {
    const err = session.error;
    const isExpired = err instanceof ApiError && (err.code === "SESSION_EXPIRED" || err.code === "SESSION_REQUIRED");
    if (!isExpired) {
      return (
        <FullPageMessage
          title={err instanceof ApiError && err.code === "AUTH_NOT_CONFIGURED" ? "Sign-in isn’t available yet" : "iSchoolie couldn’t load"}
          body={err instanceof ApiError ? err.message : "Check your connection and try again."}
          action={<Button onClick={() => session.refetch()}>Try again</Button>}
        />
      );
    }
  }
  const value = session.data ? { ...session.data, badges: badges.data ?? session.data.badges } : null;
  return (
    <SessionContext.Provider value={value}>
      {value ? children : <FullPageMessage title="Your demo session ended" body="Demo sessions expire after a period of inactivity. Start a fresh demo workspace to continue." action={<Button onClick={restart} disabled={restarting}>{restarting ? "Starting…" : "Start a new demo"}</Button>} />}
      <Dialog open={expired && !!value} onOpenChange={() => {}} title="Your demo session ended" dismissible={false}>
        <DialogBody>
          <p className="text-fg2">
            Demo sessions are anonymous and expire after inactivity, so they can’t be recovered on another device. Start a fresh demo workspace to keep exploring. Your previous demo data is not carried over.
          </p>
          {restartError && <p className="mt-3 text-danger" role="alert">{restartError}</p>}
        </DialogBody>
        <DialogFooter>
          <Button onClick={restart} disabled={restarting}>{restarting ? "Starting…" : "Start a new demo"}</Button>
        </DialogFooter>
      </Dialog>
    </SessionContext.Provider>
  );
}

export function AppLoading() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-bg" role="status" aria-label="Loading iSchoolie">
      <img src="/brand/ischoolie-symbol.png" alt="" width={72} height={72} className="motion-fade" />
    </div>
  );
}

export function FullPageMessage({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col items-center justify-center gap-4 px-6 text-center">
      <img src="/brand/ischoolie-symbol.png" alt="iSchoolie" width={56} height={56} />
      <h1 className="text-display font-extrabold">{title}</h1>
      <p className="text-fg2">{body}</p>
      {action}
    </main>
  );
}
