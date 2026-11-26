"use client";
/**
 * Demo/testing controls, clearly labelled. Switching identity is limited to seeded
 * accounts inside the current workspace; it fully clears viewer-scoped caches and
 * reloads so no previous actor's private data stays in memory.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { Dialog, DialogBody, ConfirmDialog } from "@/components/ui/dialog";
import { Avatar, DisplayName, ErrorState } from "@/components/ui/misc";
import { UserSkeleton } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { get, post, errorMessage } from "@/lib/api";
import { useSession } from "@/components/providers";
import type { UserDTO } from "@/lib/types";

const Ctx = createContext<{ openSwitcher: () => void; openReset: () => void }>({ openSwitcher: () => {}, openReset: () => {} });
export const useDemoControls = () => useContext(Ctx);

export function DemoControlsProvider({ children }: { children: ReactNode }) {
  const [switcher, setSwitcher] = useState(false);
  const [reset, setReset] = useState(false);
  return (
    <Ctx.Provider value={{ openSwitcher: () => setSwitcher(true), openReset: () => setReset(true) }}>
      {children}
      {switcher && <SwitcherDialog onClose={() => setSwitcher(false)} />}
      <ResetDialog open={reset} onOpenChange={setReset} />
    </Ctx.Provider>
  );
}

function SwitcherDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["identities"], queryFn: () => get<(UserDTO & { current: boolean })[]>("/session/identities") });
  const choose = async (handle: string) => {
    setBusy(handle);
    try {
      await post("/session/actor", { handle });
      qc.clear();
      // Full reload on purpose: drops every viewer-scoped cache and in-flight poll of the previous actor.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/home");
    } catch (e) {
      toast({ text: errorMessage(e), tone: "error" });
      setBusy(null);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Switch demo identity" fullScreenMobile>
      <div className="flex gap-3 border-b border-line bg-subtle px-4 py-3 text-sm text-fg2">
        <FlaskConical size={18} className="mt-0.5 shrink-0 text-accent-text" />
        <p>
          Demo testing control. Act as any fictional seeded account inside <b>your own</b> demo workspace to try both sides of follows, requests and messages. This isn’t sign-in and doesn’t exist in live mode.
        </p>
      </div>
      {q.isPending && <UserSkeleton count={5} />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      <ul>
        {q.data?.map((u) => (
          <li key={u.id}>
            <button type="button" disabled={u.current || !!busy} onClick={() => choose(u.handle)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover disabled:cursor-default">
              <Avatar user={u} size={40} />
              <div className="min-w-0 flex-1">
                <DisplayName user={u} />
                <div className="text-sm text-fg2">@{u.handle}</div>
              </div>
              {u.current && <span className="text-sm font-bold text-accent-text">Current</span>}
              {busy === u.handle && <span className="text-sm text-fg2">Switching…</span>}
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function ResetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const s = useSession();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Reset this demo workspace?"
      body={
        <>
          Everything you created in this demo workspace — posts, messages, lists, uploads — will be permanently deleted and the fictional seed content restored. This affects only your workspace{s.mode === "demo" ? "" : ""}. It can’t be undone.
        </>
      }
      confirmLabel="Reset workspace"
      danger
      busy={busy}
      onConfirm={async () => {
        setBusy(true);
        try {
          await post("/session/reset", { confirm: "RESET" });
          qc.clear();
          // Full reload on purpose: drops every viewer-scoped cache and in-flight poll of the previous actor.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/home");
        } catch (e) {
          toast({ text: errorMessage(e), tone: "error" });
          setBusy(false);
        }
      }}
    />
  );
}

export function DemoNotice() {
  const s = useSession();
  if (s.mode !== "demo") return null;
  const exp = s.workspace.expiresAt ? new Date(s.workspace.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  return (
    <div className="border-b border-line bg-accent-softer px-4 py-2 text-sm text-fg2" role="note">
      <b className="text-fg">Demo environment.</b> Fictional people and posts; your changes stay in a private workspace kept for {s.workspace.retentionDays} days after your last visit{exp ? ` (currently until ${exp})` : ""}.{" "}
      <Link href="/help#demo-mode" className="text-accent-text hover:underline">Learn more</Link>
    </div>
  );
}

export { DialogBody };
