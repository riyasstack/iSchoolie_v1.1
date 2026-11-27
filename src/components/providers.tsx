"use client";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { get, post, ApiError, SESSION_EVENT, AUTH_PROMPT_EVENT } from "@/lib/api";
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

/** True for live-mode guests and signed-in viewers who haven't picked a username yet. */
export function useIsGuest(): boolean {
  const s = useOptionalSession();
  return !!s && s.viewer !== "member";
}

const AuthPromptContext = createContext<(action?: string) => void>(() => {});

/**
 * Returns a guard for account-only actions: true for members; for guests it opens the
 * sign-up prompt and returns false. The API refuses these actions for guests anyway.
 */
export function useRequireAccount(): (action?: string) => boolean {
  const s = useOptionalSession();
  const prompt = useContext(AuthPromptContext);
  return useCallback(
    (action?: string) => {
      if (!s || s.viewer === "member") return true;
      prompt(action);
      return false;
    },
    [s, prompt],
  );
}

/**
 * Wraps account-only controls: for guests, interacting with them opens the sign-up
 * prompt instead. Descendants marked data-guest-ok stay usable.
 */
export function GuestGate({ action, children }: { action: string; children: ReactNode }) {
  const guest = useIsGuest();
  const prompt = useContext(AuthPromptContext);
  if (!guest) return <>{children}</>;
  const stop = (e: SyntheticEvent) => {
    if ((e.target as HTMLElement).closest("[data-guest-ok]")) return;
    if (e.type === "keydown") {
      const k = (e.nativeEvent as KeyboardEvent).key;
      if (k !== "Enter" && k !== " ") return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.type !== "pointerdown") prompt(action);
  };
  return (
    <div className="contents" data-guest-gate="" onPointerDownCapture={stop} onClickCapture={stop} onKeyDownCapture={stop}>
      {children}
    </div>
  );
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
  if (meta) meta.setAttribute("content", p.theme === "DIM" ? "#161618" : p.theme === "LIGHTS_OUT" ? "#000000" : "#f5f5f7");
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
    enabled: !!session.data && session.data.viewer === "member",
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
    // Signed in but no profile yet: finish onboarding first.
    if (session.data?.viewer === "onboarding") {
      window.location.replace(`/onboarding?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
  }, [session.data]);

  const [promptAction, setPromptAction] = useState<string | null>(null);
  const openPrompt = useCallback((action?: string) => setPromptAction(action ?? "join the conversation"), []);
  useEffect(() => {
    const onPrompt = () => openPrompt();
    window.addEventListener(AUTH_PROMPT_EVENT, onPrompt);
    return () => window.removeEventListener(AUTH_PROMPT_EVENT, onPrompt);
  }, [openPrompt]);

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
     <AuthPromptContext.Provider value={openPrompt}>
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
      <SignUpPrompt action={promptAction} onClose={() => setPromptAction(null)} />
     </AuthPromptContext.Provider>
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

/** Query string that brings the viewer back to the current page after signing in. */
export function useReturnTo(): string {
  const pathname = usePathname();
  return pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
}

function SignUpPrompt({ action, onClose }: { action: string | null; onClose: () => void }) {
  const ret = useReturnTo();
  return (
    <Dialog open={action !== null} onOpenChange={(o) => !o && onClose()} title="Join iSchoolie" hideTitle width={420}>
      <div className="flex flex-col items-center px-8 pb-8 pt-2 text-center" data-testid="signup-prompt">
        <img src="/brand/ischoolie-symbol.png" alt="" width={44} height={44} />
        <h2 className="mt-4 text-[23px] font-extrabold leading-tight">Your campus is talking</h2>
        <p className="mt-2 text-fg2">You’re browsing as a guest. Sign up or log in to {action ?? "join the conversation"}.</p>
        <Link href={`/signup${ret}`} onClick={onClose} className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-accent px-4 font-semibold text-accent-on hover:bg-accent-hover">
          Sign up
        </Link>
        <Link href={`/signin${ret}`} onClick={onClose} className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-accent px-4 font-semibold text-accent-text hover:bg-accent-soft">
          Log in
        </Link>
      </div>
    </Dialog>
  );
}
