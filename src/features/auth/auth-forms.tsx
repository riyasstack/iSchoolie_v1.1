"use client";
/**
 * Sign in / sign up / password recovery / onboarding (live mode, Supabase Auth).
 * Passwords go straight from the browser to Supabase Auth; the app never sees them.
 */
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { safeNext } from "@/lib/supabase/config";
import { ApiError, get, post } from "@/lib/api";
import { TextField } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { validateHandle, NAME_MAX } from "@/lib/text";

export type AuthEnv = {
  mode: "demo" | "live";
  configured: boolean;
  /** Sign-in methods enabled in the Supabase project. */
  providers: { google: boolean; github: boolean; email: boolean; signupDisabled: boolean };
};

const PASSWORD_MIN = 8;

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[600px] flex-col px-4 pb-10 pt-5 sm:px-8">
      <Link href="/home" aria-label="iSchoolie home" className="mb-6 self-start">
        <img src="/brand/ischoolie-symbol.png" alt="iSchoolie" width={39} height={39} />
      </Link>
      <h1 className="mb-4 px-4 text-[23px] font-extrabold leading-tight sm:text-[31px]">{title}</h1>
      {children}
      {footer && <div className="mt-6 flex flex-wrap justify-center gap-x-2 gap-y-1 px-4 text-post text-accent-text">{footer}</div>}
    </main>
  );
}

function Alert({ tone = "danger", children }: { tone?: "danger" | "info"; children: ReactNode }) {
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={tone === "danger" ? "mx-4 mb-2 rounded-md bg-like-soft px-3 py-2 text-sm text-danger" : "mx-4 mb-2 rounded-md bg-accent-soft px-3 py-2 text-sm text-fg"}>
      {children}
    </p>
  );
}

/** Shown on every auth page when the app runs in demo mode or Supabase isn't configured. */
function Unavailable({ env }: { env: AuthEnv }) {
  return (
    <AuthCard title={env.mode === "demo" ? "No account needed in the demo" : "Sign-in isn’t available yet"}>
      <p className="px-4 text-fg2">
        {env.mode === "demo"
          ? "This iSchoolie instance runs in demo mode: every visitor gets a private sandbox of fictional people and posts, so there’s nothing to sign in to."
          : "This server is in live mode, but Supabase Auth isn’t configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see AUTH_INTEGRATION.md)."}
      </p>
      <div className="mt-6 px-4">
        <Link href="/home" className="inline-flex min-h-[36px] items-center rounded-xl bg-accent px-4 font-semibold text-accent-on">Go to Home</Link>
      </div>
    </AuthCard>
  );
}

const ERROR_TEXT: Record<string, string> = {
  missing_code: "That sign-in link is incomplete. Try signing in again.",
  invalid_link: "That link is invalid or has expired.",
  not_configured: "Sign-in isn’t configured on this server.",
  access_denied: "Sign-in was cancelled.",
};

function friendly(message: string): string {
  if (ERROR_TEXT[message]) return ERROR_TEXT[message];
  if (/invalid login credentials/i.test(message)) return "The email and password you entered did not match our records.";
  if (/email not confirmed/i.test(message)) return "Confirm your email address first — check your inbox for the link we sent.";
  if (/already registered|already exists/i.test(message)) return "An account with this email already exists. Log in instead.";
  if (/rate limit|too many/i.test(message)) return "Too many attempts. Wait a minute and try again.";
  if (/provider is not enabled|unsupported provider/i.test(message)) return "That sign-in method isn’t enabled for this site yet.";
  if (/expired|invalid.*(token|otp|code)/i.test(message)) return "That link has expired. Request a new one.";
  return message;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path fill="#EA4335" d="M9 3.48c1.69 0 2.83.73 3.48 1.34l2.54-2.48C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.91 2.26C4.6 5.05 6.62 3.48 9 3.48z" />
      <path fill="#4285F4" d="M17.64 9.2c0-.74-.06-1.28-.19-1.84H9v3.34h4.96c-.1.83-.64 2.08-1.84 2.92l2.84 2.2c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#FBBC05" d="M3.88 10.78A5.54 5.54 0 0 1 3.58 9c0-.62.11-1.22.29-1.78L.96 4.96A9.008 9.008 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.92-2.26z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.84-2.2c-.76.53-1.78.9-3.12.9-2.38 0-4.4-1.57-5.12-3.74L.97 13.04C2.45 15.98 5.48 18 9 18z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function callbackUrl(next: string) {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

function OAuthButtons({ next, verb, onError, enabled }: { next: string; verb: string; onError: (m: string) => void; enabled: AuthEnv["providers"] }) {
  const [busy, setBusy] = useState<"google" | "github" | null>(null);
  const go = async (provider: "google" | "github") => {
    setBusy(provider);
    const { data, error } = await supabaseBrowser().auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl(next), skipBrowserRedirect: true } });
    if (error || !data?.url) {
      setBusy(null);
      onError(friendly(error?.message ?? "Couldn’t start sign-in."));
      return;
    }
    window.location.assign(data.url);
  };
  return (
    <div className="flex flex-col gap-3 px-4">
      <button type="button" onClick={() => go("google")} disabled={!!busy || !enabled.google} title={enabled.google ? undefined : "Google sign-in isn’t enabled for this site yet"} data-provider="google" className="inline-flex min-h-[44px] w-full items-center justify-center gap-3 rounded-xl border border-line-strong bg-white px-4 font-semibold text-[#0f1419] hover:bg-[#f7f9f9] disabled:opacity-60">
        <GoogleIcon /> {busy === "google" ? "Redirecting…" : `${verb} with Google`}
        {!enabled.google && <span className="text-xs font-normal">(not enabled yet)</span>}
      </button>
      <button type="button" onClick={() => go("github")} disabled={!!busy || !enabled.github} title={enabled.github ? undefined : "GitHub sign-in isn’t enabled for this site yet"} data-provider="github" className="inline-flex min-h-[44px] w-full items-center justify-center gap-3 rounded-xl bg-[#24292f] px-4 font-semibold text-white hover:bg-[#32383f] disabled:opacity-60">
        <GitHubIcon /> {busy === "github" ? "Redirecting…" : `${verb} with GitHub`}
        {!enabled.github && <span className="text-xs font-normal">(not enabled yet)</span>}
      </button>
    </div>
  );
}

function Divider() {
  return (
    <div className="my-4 flex items-center gap-3 px-4 text-sm text-fg2" aria-hidden="true">
      <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function useNext() {
  const params = useSearchParams();
  return safeNext(params.get("next"));
}

// ------------------------------------------------------------------ sign in

export function SignInForm({ env }: { env: AuthEnv }) {
  const params = useSearchParams();
  const next = useNext();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const e = params.get("error");
    return e ? friendly(e) : null;
  });
  const notice = params.get("notice");
  if (env.mode !== "live" || !env.configured) return <Unavailable env={env} />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setBusy(false);
      return setError(friendly(error.message));
    }
    // Full navigation so server-rendered state picks up the new session cookies.
    window.location.assign(next);
  };

  return (
    <AuthCard
      title="Log in to iSchoolie"
      footer={
        <>
          <Link href={`/auth/forgot${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="hover:underline">Forgot password?</Link>
          <span aria-hidden="true" className="text-fg2">·</span>
          <Link href={`/signup${next !== "/home" ? `?next=${encodeURIComponent(next)}` : ""}`} className="hover:underline">Sign up for iSchoolie</Link>
        </>
      }
    >
      {notice === "password_updated" && <Alert tone="info">Your password was updated. Log in with your new password.</Alert>}
      {error && <Alert>{error}</Alert>}
      <OAuthButtons next={next} verb="Continue" onError={setError} enabled={env.providers} />
      <Divider />
      <form onSubmit={submit} noValidate>
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} countMode="none" required />
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} countMode="none" required />
        <div className="px-4 pt-3">
          <Button type="submit" size="lg" full disabled={busy}>{busy ? "Logging in…" : "Log in"}</Button>
        </div>
      </form>
      <p className="mt-6 px-4 text-center text-sm text-fg2">
        Just looking? <Link href="/home" className="text-accent-text hover:underline">Browse as a guest</Link>
      </p>
    </AuthCard>
  );
}

// ------------------------------------------------------------------ sign up

export function SignUpForm({ env }: { env: AuthEnv }) {
  const next = useNext();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  if (env.mode !== "live" || !env.configured) return <Unavailable env={env} />;

  const onboardingNext = `/onboarding${next !== "/home" ? `?next=${encodeURIComponent(next)}` : ""}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("What’s your name?");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Please enter a valid email.");
    if (password.length < PASSWORD_MIN) return setError(`Your password needs to be at least ${PASSWORD_MIN} characters.`);
    setBusy(true);
    const { data, error } = await supabaseBrowser().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim().slice(0, NAME_MAX) }, emailRedirectTo: callbackUrl(onboardingNext) },
    });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    // Supabase returns a user with no identities when the email is already registered.
    if (data.user && data.user.identities && data.user.identities.length === 0) return setError(friendly("already registered"));
    if (data.session) {
      window.location.assign(onboardingNext);
      return;
    }
    setSentTo(email.trim());
  };

  if (sentTo) {
    return (
      <AuthCard title="Check your email">
        <p className="px-4 text-fg2">
          We sent a confirmation link to <strong className="text-fg">{sentTo}</strong>. Open it on this device to finish creating your account.
        </p>
        <p className="mt-4 px-4 text-sm text-fg2">Didn’t get it? Check your spam folder, or <button type="button" className="text-accent-text hover:underline" onClick={() => setSentTo(null)}>try again</button>.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      footer={
        <>
          <span className="text-fg2">Have an account already?</span>
          <Link href={`/signin${next !== "/home" ? `?next=${encodeURIComponent(next)}` : ""}`} className="hover:underline">Log in</Link>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <OAuthButtons next={onboardingNext} verb="Sign up" onError={setError} enabled={env.providers} />
      <Divider />
      <form onSubmit={submit} noValidate>
        <TextField label="Name" autoComplete="name" value={name} onChange={setName} max={NAME_MAX} required />
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} countMode="none" required />
        <TextField label="Password" type="password" autoComplete="new-password" value={password} onChange={setPassword} countMode="none" hint={`At least ${PASSWORD_MIN} characters.`} required />
        <div className="px-4 pt-3">
          <Button type="submit" size="lg" full disabled={busy}>{busy ? "Creating account…" : "Sign up"}</Button>
        </div>
      </form>
      <p className="mt-4 px-4 text-xs text-fg2">By signing up you agree to use iSchoolie respectfully. You’ll choose your @username next.</p>
    </AuthCard>
  );
}

// ------------------------------------------------------------------ password recovery

export function ForgotPasswordForm({ env }: { env: AuthEnv }) {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  if (env.mode !== "live" || !env.configured) return <Unavailable env={env} />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Please enter a valid email.");
    setBusy(true);
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), { redirectTo: callbackUrl("/auth/reset") });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    setSent(true);
  };

  return (
    <AuthCard title="Find your iSchoolie account" footer={<Link href="/signin" className="hover:underline">Back to log in</Link>}>
      {sent ? (
        <Alert tone="info">If an account exists for {email.trim()}, we’ve sent a link to reset the password.</Alert>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="px-4 text-fg2">Enter the email associated with your account and we’ll send you a link to reset your password.</p>
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <TextField label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} countMode="none" required />
          <div className="px-4 pt-3">
            <Button type="submit" size="lg" full disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
          </div>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPasswordForm({ env }: { env: AuthEnv }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  useEffect(() => {
    if (env.mode !== "live" || !env.configured) return;
    supabaseBrowser().auth.getUser().then(({ data }) => setHasSession(!!data.user));
  }, [env]);
  if (env.mode !== "live" || !env.configured) return <Unavailable env={env} />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN) return setError(`Your password needs to be at least ${PASSWORD_MIN} characters.`);
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return setError(friendly(error.message));
    }
    // Sign out everywhere so the new password is required on every device.
    await supabase.auth.signOut({ scope: "global" });
    router.replace("/signin?notice=password_updated");
  };

  if (hasSession === false) {
    return (
      <AuthCard title="Reset link expired" footer={<Link href="/auth/forgot" className="hover:underline">Request a new link</Link>}>
        <p className="px-4 text-fg2">Open the most recent password reset link from your email on this device, or request a new one.</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password">
      {error && <Alert>{error}</Alert>}
      <form onSubmit={submit} noValidate>
        <TextField label="New password" type="password" autoComplete="new-password" value={password} onChange={setPassword} countMode="none" hint={`At least ${PASSWORD_MIN} characters.`} required />
        <TextField label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} countMode="none" required />
        <div className="px-4 pt-3">
          <Button type="submit" size="lg" full disabled={busy || hasSession === null}>{busy ? "Saving…" : "Change password"}</Button>
        </div>
      </form>
    </AuthCard>
  );
}

// ------------------------------------------------------------------ onboarding

type OnboardingInfo = { email: string | null; providers: string[]; suggestion: { displayName: string; handle: string } };

export function OnboardingForm({ env }: { env: AuthEnv }) {
  const next = useNext();
  const [info, setInfo] = useState<OnboardingInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [availability, setAvailability] = useState<{ handle: string; available: boolean; reason: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (env.mode !== "live" || !env.configured) return;
    get<OnboardingInfo>("/onboarding")
      .then((d) => {
        setInfo(d);
        setName(d.suggestion.displayName);
        setHandle(d.suggestion.handle);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.code === "CONFLICT") window.location.replace(next);
        else if (e instanceof ApiError && e.code === "SIGN_UP_REQUIRED") window.location.replace("/signin?next=/onboarding");
        else setLoadError(e instanceof ApiError ? e.message : "Couldn’t load your account.");
      });
  }, [env, next]);

  const localError = useMemo(() => (handle ? validateHandle(handle) : null), [handle]);
  useEffect(() => {
    if (!handle || localError) return;
    const t = setTimeout(() => {
      get<{ available: boolean; reason: string | null }>(`/onboarding/handle?handle=${encodeURIComponent(handle)}`)
        .then((r) => setAvailability({ handle, ...r }))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [handle, localError]);

  if (env.mode !== "live" || !env.configured) return <Unavailable env={env} />;
  if (loadError) return <AuthCard title="Something went wrong"><Alert>{loadError}</Alert></AuthCard>;
  if (!info) return <AuthCard title="Setting up…"><p className="px-4 text-fg2" role="status">Loading your account…</p></AuthCard>;

  const handleError = localError ?? (availability?.handle === handle && !availability.available ? availability.reason : null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("What’s your name?");
    if (!handle || handleError) return setError(handleError ?? "Choose a username.");
    setBusy(true);
    try {
      await post("/onboarding", { handle, displayName: name });
      window.location.assign(next);
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError ? err.message : "Couldn’t create your profile.");
    }
  };

  const signOut = async () => {
    await supabaseBrowser().auth.signOut({ scope: "local" });
    window.location.assign("/home");
  };

  return (
    <AuthCard title="Pick a username" footer={<button type="button" onClick={signOut} className="hover:underline">Not you? Log out</button>}>
      <p className="px-4 text-fg2">
        Signed in{info.email ? <> as <strong className="text-fg">{info.email}</strong></> : null}. Choose how you’ll appear on iSchoolie — you can change your name later.
      </p>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      <form onSubmit={submit} noValidate className="mt-2">
        <TextField label="Name" autoComplete="name" value={name} onChange={setName} max={NAME_MAX} required />
        <TextField
          label="Username"
          autoComplete="username"
          value={handle}
          onChange={(v) => setHandle(v.replace(/^@/, "").replace(/\s/g, ""))}
          countMode="none"
          max={15}
          error={handleError}
          hint={availability?.handle === handle && availability.available ? `@${handle} is available.` : "4–15 letters, numbers or underscores."}
          required
        />
        <div className="px-4 pt-3">
          <Button type="submit" size="lg" full disabled={busy}>{busy ? "Creating profile…" : "Next"}</Button>
        </div>
      </form>
    </AuthCard>
  );
}
