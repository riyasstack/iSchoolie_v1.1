"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronRight, Check, Trash2, FlaskConical, RotateCcw, Lock, KeyRound, Mail, Smartphone, Plug, UserX } from "lucide-react";
import { PageHeader, signOut } from "@/components/layout/app-shell";
import { Avatar, Checkbox, DisplayName, EmptyState, ErrorState, Switch, TextField } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody } from "@/components/ui/dialog";
import { Spinner, UserSkeleton } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { applyPreferences, useSession } from "@/components/providers";
import { get, patch, post, del, put, errorMessage } from "@/lib/api";
import { validateHandle } from "@/lib/text";
import { useDemoControls } from "../demo-controls";
import { SHORTCUTS } from "../shortcuts";
import { UserCell } from "../profiles/people";
import { PostCard } from "../posts/post-card";
import type { PreferencesDTO, SessionDTO, UserListItem } from "@/lib/types";

const NAV: { href: string; label: string; desc: string }[] = [
  { href: "/settings/account", label: "Your account", desc: "Account information and demo session details" },
  { href: "/settings/privacy_and_safety", label: "Privacy and safety", desc: "Protected posts, messages, sensitive content" },
  { href: "/settings/notifications", label: "Alerts", desc: "Which in-app alerts you get" },
  { href: "/settings/content", label: "Content preferences", desc: "Discover, search and Interests" },
  { href: "/settings/display", label: "Display", desc: "Theme, color and font size" },
  { href: "/settings/accessibility", label: "Accessibility", desc: "Motion and media descriptions" },
  { href: "/settings/data", label: "Data usage", desc: "Autoplay and data saver" },
  { href: "/settings/demo", label: "Demo environment", desc: "Identity switcher, reset and retention" },
  { href: "/help", label: "Help Center", desc: "How iSchoolie works in this demo" },
];

export function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const root = pathname === "/settings";
  return (
    <div className="flex min-h-dvh">
      <nav aria-label="Settings" className={clsx("w-full border-line md:w-[390px] md:shrink-0 md:border-r", !root && "max-md:hidden")}>
        <PageHeader title="Settings" back={root ? "/home" : undefined} />
        <ul>
          {NAV.map((n) => {
            const active = pathname.startsWith(n.href) || (pathname === "/settings" && n.href === "/settings/account" && false);
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? "page" : undefined} className={clsx("flex items-center gap-3 border-r-2 px-4 py-3 hover:bg-hover", active ? "border-accent bg-subtle" : "border-transparent")}>
                  <span className="min-w-0 flex-1">
                    <span className="block">{n.label}</span>
                    <span className="block text-sm text-fg2">{n.desc}</span>
                  </span>
                  <ChevronRight size={18} className="text-fg2" />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className={clsx("min-w-0 flex-1", root && "max-md:hidden")}>{children}</div>
    </div>
  );
}

export function SettingsIndex() {
  return (
    <div className="hidden md:block">
      <EmptyState title="Settings" body="Choose a section on the left. Every setting here is saved to your demo workspace and takes effect immediately." />
    </div>
  );
}

function usePrefs() {
  const qc = useQueryClient();
  const toast = useToast();
  const s = useSession();
  const m = useMutation({
    mutationFn: (patchBody: Partial<PreferencesDTO>) => patch<PreferencesDTO>("/me/preferences", patchBody),
    onMutate: (p) => {
      const prev = qc.getQueryData<SessionDTO>(["session"]);
      if (prev) {
        const next = { ...prev, preferences: { ...prev.preferences, ...p } };
        qc.setQueryData(["session"], next);
        applyPreferences(next.preferences);
      }
      return { prev };
    },
    onError: (e, _p, c) => {
      if (c?.prev) {
        qc.setQueryData(["session"], c.prev);
        applyPreferences(c.prev.preferences);
      }
      toast({ text: errorMessage(e), tone: "error" });
    },
    onSuccess: (p) => {
      qc.setQueryData<SessionDTO>(["session"], (old) => (old ? { ...old, preferences: p } : old));
      // Feed/notification filters changed: refetch the affected lists.
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["badges"] });
    },
  });
  return { prefs: s.preferences, set: (p: Partial<PreferencesDTO>) => m.mutate(p) };
}

function Section({ title, children, desc }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-line py-2">
      <h2 className="px-4 pt-2 text-heading font-extrabold">{title}</h2>
      {desc && <p className="px-4 pt-1 text-sm text-fg2">{desc}</p>}
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ account
export function AccountSettings() {
  const s = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [handle, setHandle] = useState(s.actor.handle);
  const err = handle === s.actor.handle ? null : validateHandle(handle);
  const save = useMutation({
    mutationFn: () => patch<{ handle: string }>("/me/account", { handle }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast({ text: "Username updated" });
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  const unavailable = [
    { icon: <KeyRound size={18} />, label: "Change your password" },
    { icon: <Mail size={18} />, label: "Email address" },
    { icon: <Smartphone size={18} />, label: "Phone number" },
    { icon: <Plug size={18} />, label: "Apps and sessions" },
    { icon: <UserX size={18} />, label: "Deactivate your account" },
  ];
  return (
    <div>
      <PageHeader title="Your account" back="/settings" />
      <Section title="Account information">
        <div className="flex items-center gap-3 px-4 py-3">
          <Avatar user={s.actor} size={48} />
          <div>
            <DisplayName user={s.actor} />
            <div className="text-fg2">@{s.actor.handle}</div>
          </div>
          <Link href="/settings/profile" className="ml-auto text-accent-text hover:underline">Edit profile</Link>
        </div>
        <TextField label="Username" value={handle} onChange={setHandle} max={15} countMode="none" error={err} hint="4–15 letters, numbers or underscores. Some names are reserved for app pages." />
        <div className="flex justify-end px-4 pb-3">
          <Button size="sm" disabled={!!err || handle === s.actor.handle || save.isPending} onClick={() => save.mutate()}>Save</Button>
        </div>
        <p className="px-4 pb-3 text-sm text-fg2">Protected posts and messaging permissions are under <Link href="/settings/privacy_and_safety" className="text-accent-text">Privacy and safety</Link>.</p>
      </Section>
      {s.mode === "live" ? (
        <LiveSecurity />
      ) : (
      <Section title="Sign-in and security" desc="This demo has no sign-in. Sign-in is available when the server runs in live mode with Supabase Auth.">
        <ul>
          {unavailable.map((u) => (
            <li key={u.label} className="flex items-center gap-3 px-4 py-3 text-fg2">
              {u.icon} <span className="flex-1">{u.label}</span> <span className="text-xs">Not available in demo</span>
            </li>
          ))}
        </ul>
      </Section>
      )}
    </div>
  );
}

const PROVIDER_LABEL: Record<string, string> = { email: "Email and password", google: "Google", github: "GitHub" };

/** Live mode: the Supabase account behind this profile. */
function LiveSecurity() {
  const s = useSession();
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const providers = s.account?.providers ?? [];
  const changePassword = async () => {
    setPwError(null);
    if (pw.length < 8) return setPwError("Your password needs to be at least 8 characters.");
    if (pw !== pw2) return setPwError("Passwords do not match.");
    setBusy(true);
    const { supabaseBrowser } = await import("@/lib/supabase/browser");
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setPwError(/reauthentication|recent/i.test(error.message) ? "For security, log out and back in, then try again." : error.message);
    setPw("");
    setPw2("");
    toast({ text: "Password updated" });
  };
  return (
    <Section title="Sign-in and security">
      <div className="flex items-center gap-3 px-4 py-3">
        <Mail size={18} className="text-fg2" />
        <div className="min-w-0 flex-1">
          <div>Email</div>
          <div className="truncate text-sm text-fg2" data-testid="account-email">{s.account?.email ?? "No email on this account"}</div>
        </div>
      </div>
      <div className="flex items-start gap-3 px-4 py-3">
        <Plug size={18} className="mt-0.5 text-fg2" />
        <div className="min-w-0 flex-1">
          <div>Sign-in methods</div>
          <div className="text-sm text-fg2">{providers.length ? providers.map((p) => PROVIDER_LABEL[p] ?? p).join(", ") : "—"}</div>
        </div>
      </div>
      <div className="px-0 pt-2">
        <h3 className="flex items-center gap-2 px-4 font-bold"><KeyRound size={18} /> {providers.includes("email") ? "Change your password" : "Set a password"}</h3>
        <TextField label="New password" type="password" autoComplete="new-password" value={pw} onChange={setPw} countMode="none" />
        <TextField label="Confirm password" type="password" autoComplete="new-password" value={pw2} onChange={setPw2} countMode="none" error={pwError} />
        <div className="flex justify-end px-4 pb-3">
          <Button size="sm" disabled={busy || !pw} onClick={changePassword}>{busy ? "Saving…" : "Save password"}</Button>
        </div>
      </div>
      <div className="border-t border-line px-4 py-3">
        <Button variant="danger-outline" size="sm" onClick={signOut}>Log out</Button>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------ privacy/safety
export function PrivacySettings() {
  const s = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const { prefs, set } = usePrefs();
  const account = useMutation({
    mutationFn: (body: { isProtected?: boolean; dmPolicy?: "EVERYONE" | "FOLLOWING" }) => patch<{ isProtected: boolean; dmPolicy: "EVERYONE" | "FOLLOWING" }>("/me/account", body),
    onSuccess: (r) => {
      qc.setQueryData<SessionDTO>(["session"], (old) => (old ? { ...old, actor: { ...old.actor, isProtected: r.isProtected, dmPolicy: r.dmPolicy } } : old));
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["follow-requests"] });
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  return (
    <div>
      <PageHeader title="Privacy and safety" back="/settings" />
      <Section title="Your posts">
        <Switch
          label="Protect your posts"
          description="When on, only your approved followers can see your posts, media, cheers and lists of who you follow. Turning this off approves pending follow requests."
          checked={s.actor.isProtected}
          onChange={(v) => account.mutate({ isProtected: v })}
        />
      </Section>
      <section id="messages">
        <Section title="Inbox">
          <Switch label="Allow message requests from everyone" description="When off, only people you follow can message you. People you don’t follow land in Message requests when on." checked={s.actor.dmPolicy === "EVERYONE"} onChange={(v) => account.mutate({ dmPolicy: v ? "EVERYONE" : "FOLLOWING" })} />
          <Switch label="Show read receipts" description="Let people you message know when you’ve seen their messages. Read receipts show only when both of you allow them." checked={prefs.showReadReceipts} onChange={(v) => set({ showReadReceipts: v })} />
        </Section>
      </section>
      <Section title="Content you see">
        <Switch label="Display media that may contain sensitive content" description="When off, media in posts marked sensitive is hidden behind a warning." checked={prefs.showSensitiveMedia} onChange={(v) => set({ showSensitiveMedia: v })} />
        <Switch label="Hide sensitive content in search" checked={prefs.searchHideSensitive} onChange={(v) => set({ searchHideSensitive: v })} />
      </Section>
      <Section title="Safety">
        <NavRow href="/settings/muted_keywords" label="Muted words" desc="Hide posts with these words from your Feed and alerts" />
        <NavRow href="/settings/muted/all" label="Muted accounts" desc="You won’t see their posts in your timelines or their alerts" />
        <NavRow href="/settings/blocked/all" label="Blocked accounts" desc="They can’t follow, message or see your posts" />
        <NavRow href="/i/follower_requests" label="Follower requests" desc="Approve who can see your protected posts" />
      </Section>
    </div>
  );
}

function NavRow({ href, label, desc }: { href: string; label: string; desc?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {desc && <span className="block text-sm text-fg2">{desc}</span>}
      </span>
      <ChevronRight size={18} className="text-fg2" />
    </Link>
  );
}

export function AccountsList({ kind }: { kind: "blocked" | "muted" }) {
  const q = useQuery({ queryKey: ["me", kind], queryFn: () => get<UserListItem[]>(`/me/${kind}`) });
  const qc = useQueryClient();
  const toast = useToast();
  const undo = useMutation({
    mutationFn: (handle: string) => del(`/users/${handle}/${kind === "blocked" ? "block" : "mute"}`),
    onSuccess: (_r, h) => {
      qc.invalidateQueries({ queryKey: ["me", kind] });
      qc.invalidateQueries({ queryKey: ["timeline"] });
      toast({ text: kind === "blocked" ? `@${h} unblocked` : `@${h} unmuted` });
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  return (
    <div>
      <PageHeader title={kind === "blocked" ? "Blocked accounts" : "Muted accounts"} back="/settings/privacy_and_safety" />
      <p className="border-b border-line px-4 py-3 text-sm text-fg2">
        {kind === "blocked"
          ? "Blocked accounts can’t follow you, see your posts, reply, or message you, and you won’t see theirs. Blocking removed any follows between you."
          : "Muting hides an account’s posts from your Feed, Latest, search and alerts. They aren’t notified, and can still see and reply to your posts."}
      </p>
      {q.isPending && <UserSkeleton count={3} />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title={kind === "blocked" ? "You aren’t blocking anyone" : "You aren’t muting anyone"} body={kind === "blocked" ? "When you block someone, they’ll show up here." : "When you mute accounts, they’ll show up here."} />}
      {q.data?.map((it) => (
        <UserCell key={it.user.id} item={it} action={<Button size="sm" variant={kind === "blocked" ? "danger" : "outline"} disabled={undo.isPending} onClick={() => undo.mutate(it.user.handle)}>{kind === "blocked" ? "Unblock" : "Unmute"}</Button>} />
      ))}
    </div>
  );
}

interface MutedWord {
  id: string;
  phrase: string;
  inHome: boolean;
  inNotifications: boolean;
  expiresAt: string | null;
  expired: boolean;
}

export function MutedWords() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["muted-words"], queryFn: () => get<MutedWord[]>("/me/muted-words") });
  const [adding, setAdding] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [inHome, setInHome] = useState(true);
  const [inNotif, setInNotif] = useState(true);
  const [duration, setDuration] = useState<number | null>(null);
  const done = (list: MutedWord[]) => {
    qc.setQueryData(["muted-words"], list);
    qc.invalidateQueries({ queryKey: ["timeline"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  const add = useMutation({
    mutationFn: () => post<MutedWord[]>("/me/muted-words", { phrase, inHome, inNotifications: inNotif, durationHours: duration }),
    onSuccess: (l) => {
      done(l);
      setAdding(false);
      setPhrase("");
      toast({ text: `“${phrase}” muted` });
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  const remove = useMutation({ mutationFn: (id: string) => del<MutedWord[]>(`/me/muted-words/${id}`), onSuccess: done, onError: (e) => toast({ text: errorMessage(e), tone: "error" }) });
  return (
    <div>
      <PageHeader title="Muted words" back="/settings/privacy_and_safety" right={!adding && <Button size="sm" onClick={() => setAdding(true)}>Add</Button>} />
      <p className="border-b border-line px-4 py-3 text-sm text-fg2">Posts containing muted words or phrases are hidden from your Home and Latest timelines (and lists and topic feeds), and notifications about them are hidden. Matching is case-insensitive and whole-word; #hashtags and @mentions match anywhere.</p>
      {adding && (
        <div className="border-b border-line pb-3">
          <TextField label="Word or phrase" value={phrase} onChange={setPhrase} max={100} autoFocus />
          <p className="px-4 text-sm font-bold">Mute from</p>
          <Checkbox label="Feed" checked={inHome} onChange={setInHome} />
          <Checkbox label="Alerts" checked={inNotif} onChange={setInNotif} />
          <fieldset className="px-4 py-2">
            <legend className="text-sm font-bold">For how long?</legend>
            {[
              [null, "Forever"],
              [24, "24 hours from now"],
              [24 * 7, "7 days from now"],
              [24 * 30, "30 days from now"],
            ].map(([v, label]) => (
              <label key={String(v)} className="flex items-center gap-2 py-1">
                <input type="radio" name="duration" checked={duration === v} onChange={() => setDuration(v as number | null)} className="accent-[var(--accent)]" /> {label}
              </label>
            ))}
          </fieldset>
          <div className="flex justify-end gap-2 px-4">
            <Button size="sm" variant="neutral" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" disabled={!phrase.trim() || (!inHome && !inNotif) || add.isPending} onClick={() => add.mutate()}>Save</Button>
          </div>
        </div>
      )}
      {q.isPending && <Spinner className="py-6" />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && !adding && <EmptyState title="You aren’t muting any words" body="When you mute words, you won’t see posts with them in your timeline or get notified about them." />}
      <ul>
        {q.data?.map((w) => (
          <li key={w.id} className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-bold break-anywhere">{w.phrase}</div>
              <div className="text-sm text-fg2">
                {[w.inHome && "Feed", w.inNotifications && "Alerts"].filter(Boolean).join(", ")} · {w.expired ? "Expired" : w.expiresAt ? `Until ${new Date(w.expiresAt).toLocaleString()}` : "Forever"}
              </div>
            </div>
            <button type="button" aria-label={`Unmute ${w.phrase}`} onClick={() => remove.mutate(w.id)} className="grid h-9 w-9 place-items-center rounded-xl text-danger hover:bg-like-soft"><Trash2 size={18} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------- notifications
export function NotificationSettings() {
  const { prefs, set } = usePrefs();
  return (
    <div>
      <PageHeader title="Alerts" back="/settings" />
      <Section title="In-app alerts" desc="Turning a type off stops new alerts of that type from being created for you.">
        <Switch label="Cheers" checked={prefs.notifyLikes} onChange={(v) => set({ notifyLikes: v })} />
        <Switch label="Shares" checked={prefs.notifyReposts} onChange={(v) => set({ notifyReposts: v })} />
        <Switch label="Replies" checked={prefs.notifyReplies} onChange={(v) => set({ notifyReplies: v })} />
        <Switch label="Mentions" checked={prefs.notifyMentions} onChange={(v) => set({ notifyMentions: v })} />
        <Switch label="Quote shares" checked={prefs.notifyQuotes} onChange={(v) => set({ notifyQuotes: v })} />
        <Switch label="New followers" checked={prefs.notifyFollows} onChange={(v) => set({ notifyFollows: v })} />
      </Section>
      <Section title="Filters" desc="Filters hide matching alerts from your Alerts and badge; they can be turned back off.">
        <Checkbox label="Hide alerts from people you don’t follow" checked={prefs.filterNotFollowing} onChange={(v) => set({ filterNotFollowing: v })} />
        <Checkbox label="Hide alerts from accounts without a profile photo" checked={prefs.filterNoAvatar} onChange={(v) => set({ filterNoAvatar: v })} />
        <Link href="/settings/muted_keywords" className="block px-4 py-3 text-accent-text hover:underline">Muted words</Link>
      </Section>
      <Section title="Push and email alerts" desc="No push or email delivery service is connected to this demo, so these channels are unavailable. Nothing is sent outside the app.">
        <p className="px-4 py-3 text-sm text-fg2" aria-disabled="true">Push alerts · Not available</p>
        <p className="px-4 pb-3 text-sm text-fg2" aria-disabled="true">Email alerts · Not available</p>
      </Section>
    </div>
  );
}

export function ContentSettings() {
  const { prefs, set } = usePrefs();
  return (
    <div>
      <PageHeader title="Content preferences" back="/settings" />
      <Section title="Discover">
        <Switch label="Hide sensitive content in search" checked={prefs.searchHideSensitive} onChange={(v) => set({ searchHideSensitive: v })} />
        <p className="px-4 pb-3 text-sm text-fg2">Trends in this demo are either measured from posts in your workspace or curated for the demo; each is labelled. There’s no location targeting.</p>
      </Section>
      <Section title="Timeline">
        <Switch label="Show the best posts first (Home)" description="When off, your timeline shows the latest posts first (Latest)." checked={prefs.timelineMode === "home"} onChange={(v) => set({ timelineMode: v ? "home" : "latest" })} />
      </Section>
      <Section title="Interests">
        <NavRow href="/i/topics" label="Interests" desc="Manage the Interests you follow" />
      </Section>
      <Section title="Safety">
        <NavRow href="/settings/muted_keywords" label="Muted words" />
        <NavRow href="/settings/muted/all" label="Muted accounts" />
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ display
const ACCENTS: { key: string; label: string; color: string }[] = [
  { key: "brand", label: "iSchoolie blue", color: "#1839E8" },
  { key: "yellow", label: "Yellow", color: "#F5A300" },
  { key: "pink", label: "Pink", color: "#C81E55" },
  { key: "purple", label: "Purple", color: "#794BC4" },
  { key: "orange", label: "Orange", color: "#C94A16" },
  { key: "green", label: "Green", color: "#0E8A4B" },
];
const FONT_STEPS = [88, 94, 100, 113, 125];

export function DisplaySettingsBody() {
  const { prefs, set } = usePrefs();
  return (
    <div className="px-4 py-3">
      <p className="text-center text-fg2">These settings affect all the iSchoolie screens in this browser and are saved to your demo profile.</p>
      <div className="mt-4 rounded-card border border-line pointer-events-none" aria-hidden="true">
        <PreviewPost />
      </div>
      <h3 className="mt-5 text-sm font-bold text-fg2">Font size</h3>
      <div className="mt-2 flex items-center gap-4 rounded-card bg-subtle px-4 py-3">
        <span className="text-[0.8125rem]">Aa</span>
        <input type="range" aria-label="Font size" className="legacy-range flex-1" min={0} max={FONT_STEPS.length - 1} step={1} value={Math.max(0, FONT_STEPS.indexOf(FONT_STEPS.reduce((a, b) => (Math.abs(b - prefs.fontScale) < Math.abs(a - prefs.fontScale) ? b : a))))} onChange={(e) => set({ fontScale: FONT_STEPS[Number(e.target.value)] })} />
        <span className="text-[1.25rem]">Aa</span>
      </div>
      <h3 className="mt-5 text-sm font-bold text-fg2">Color</h3>
      <div className="mt-2 flex flex-wrap justify-around gap-3 rounded-card bg-subtle px-4 py-3" role="radiogroup" aria-label="Accent color">
        {ACCENTS.map((a) => (
          <button key={a.key} type="button" role="radio" aria-checked={prefs.accent === a.key} aria-label={a.label} title={a.label} onClick={() => set({ accent: a.key })} className="grid h-11 w-11 place-items-center rounded-xl text-white" style={{ background: a.color }}>
            {prefs.accent === a.key && <Check size={22} />}
          </button>
        ))}
      </div>
      <h3 className="mt-5 text-sm font-bold text-fg2">Background</h3>
      <div className="mt-2 grid grid-cols-1 gap-2 rounded-card bg-subtle p-3 sm:grid-cols-3" role="radiogroup" aria-label="Background">
        {(
          [
            ["DEFAULT", "Light", "#f5f5f7", "#1d1d1f"],
            ["DIM", "Dusk", "#1f1f21", "#f5f5f7"],
            ["LIGHTS_OUT", "Midnight", "#000000", "#f5f5f7"],
          ] as const
        ).map(([k, label, bg, fg]) => (
          <button key={k} type="button" role="radio" aria-checked={prefs.theme === k} onClick={() => set({ theme: k })} className={clsx("flex min-h-[62px] items-center gap-3 rounded-md border-2 px-4 font-bold", prefs.theme === k ? "border-accent" : "border-transparent")} style={{ background: bg, color: fg }}>
            <span className={clsx("grid h-5 w-5 place-items-center rounded-xl border-2", prefs.theme === k ? "border-accent bg-accent text-white" : "border-current")}>{prefs.theme === k && <Check size={12} />}</span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewPost() {
  // A static illustration of a post (not a real record).
  return (
    <div className="flex gap-3 p-4">
      <img src="/brand/ischoolie-symbol.png" alt="" width={48} height={48} className="h-12 w-12 rounded-full bg-white p-1" />
      <div>
        <div className="flex gap-1"><b>iSchoolie</b> <span className="text-fg2">@ischoolie · 1m</span></div>
        <p className="text-post">At the heart of iSchoolie are short messages called posts — just like this one — which can include photos, videos, links, text, hashtags, and mentions like <span className="text-accent-text">@ischoolie_team</span>.</p>
      </div>
    </div>
  );
}

export function DisplaySettings() {
  return (
    <div>
      <PageHeader title="Display" back="/settings" />
      <DisplaySettingsBody />
    </div>
  );
}

export function DisplayDialog({ asModal }: { asModal?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  if (asModal && pathname !== "/i/display") return null;
  return (
    <Dialog open onOpenChange={(o) => !o && (asModal ? router.back() : router.push("/home"))} title="Customize your view" fullScreenMobile headerAction={<Button size="sm" className="mr-2" onClick={() => (asModal ? router.back() : router.push("/home"))}>Done</Button>}>
      <DisplaySettingsBody />
    </Dialog>
  );
}

export function ShortcutsDialog({ asModal }: { asModal?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  if (asModal && pathname !== "/i/keyboard_shortcuts") return null;
  return (
    <Dialog open onOpenChange={(o) => !o && (asModal ? router.back() : router.push("/home"))} title="Keyboard shortcuts" fullScreenMobile>
      <DialogBody>
        <p className="mb-3 text-sm text-fg2">Shortcuts never fire while you’re typing in a text field.</p>
        {SHORTCUTS.map((g) => (
          <section key={g.group} className="mb-4">
            <h3 className="mb-2 font-extrabold">{g.group}</h3>
            <dl className="grid grid-cols-[1fr_auto] gap-y-2">
              {g.items.map(([k, label]) => (
                <div key={k} className="contents">
                  <dt>{label}</dt>
                  <dd className="flex gap-1">
                    {k.split(" ").map((part) => (
                      <kbd key={part} className="min-w-[24px] rounded bg-subtle px-1.5 py-0.5 text-center text-sm font-bold">{part}</kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </DialogBody>
    </Dialog>
  );
}

// --------------------------------------------------------- accessibility/data
export function AccessibilitySettings() {
  const { prefs, set } = usePrefs();
  return (
    <div>
      <PageHeader title="Accessibility" back="/settings" />
      <Section title="Vision">
        <Switch label="Reduce motion" description="Limit animations, including like animations and transitions. Your system’s reduced-motion setting is also respected." checked={prefs.reducedMotion} onChange={(v) => set({ reducedMotion: v })} />
        <Switch label="Receive image description reminder" description="Before you post photos without descriptions, the composer reminds you to add them." checked={prefs.altTextReminder} onChange={(v) => set({ altTextReminder: v })} />
        <NavRow href="/settings/display" label="Font size and contrast" desc="Adjust in Display" />
      </Section>
      <Section title="Keyboard">
        <NavRow href="/i/keyboard_shortcuts" label="Keyboard shortcuts" />
      </Section>
    </div>
  );
}

export function DataSettings() {
  const { prefs, set } = usePrefs();
  return (
    <div>
      <PageHeader title="Data usage" back="/settings" />
      <Section title="Data saver">
        <Switch label="Data saver" description="Doesn’t preload videos and turns off autoplay for videos and GIFs. (Timelines already load reduced-size image previews; full size loads when you open a photo.)" checked={prefs.dataSaver} onChange={(v) => set({ dataSaver: v })} />
      </Section>
      <Section title="Autoplay">
        <Switch label="Autoplay videos and GIFs" description="When off, videos and GIFs play only when you tap them." checked={prefs.autoplay} onChange={(v) => set({ autoplay: v })} />
      </Section>
    </div>
  );
}

// --------------------------------------------------------------------- demo
export function DemoSettings() {
  const s = useSession();
  const demo = useDemoControls();
  return (
    <div>
      <PageHeader title="Demo environment" back="/settings" />
      <Section title="What this is">
        <p className="px-4 py-2">
          iSchoolie is running in <b>demo mode</b>. You were given a private, isolated workspace with fictional people and posts. Everything you do is saved on the server inside that workspace only.
        </p>
        <ul className="list-disc space-y-1 px-8 py-2 text-fg2">
          <li>Workspace created {new Date(s.workspace.createdAt).toLocaleString()}.</li>
          <li>Kept for {s.workspace.retentionDays} days after your last visit{s.workspace.expiresAt ? ` (currently until ${new Date(s.workspace.expiresAt).toLocaleDateString()})` : ""}, then deleted with its uploads.</li>
          <li>This is an anonymous browser session. It isn’t an account and can’t be recovered on another device or browser.</li>
        </ul>
      </Section>
      <Section title="Testing controls" desc="Clearly labelled demo-only controls. They don’t exist in live mode.">
        <button type="button" onClick={demo.openSwitcher} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover">
          <FlaskConical size={18} className="text-accent-text" />
          <span className="flex-1">Switch demo identity <span className="block text-sm text-fg2">Currently acting as @{s.actor.handle}</span></span>
        </button>
        <button type="button" onClick={demo.openReset} className="flex w-full items-center gap-3 px-4 py-3 text-left text-danger hover:bg-like-soft">
          <RotateCcw size={18} />
          <span className="flex-1">Reset this demo workspace <span className="block text-sm text-fg2">Deletes your changes and restores the seed data</span></span>
        </button>
      </Section>
      <Section title="Privacy">
        <p className="flex items-start gap-2 px-4 py-3 text-sm text-fg2"><Lock size={16} className="mt-0.5 shrink-0" /> Other visitors can’t see or change your workspace, and you can’t see theirs. Don’t enter real personal information.</p>
      </Section>
    </div>
  );
}

export { PostCard, put };
