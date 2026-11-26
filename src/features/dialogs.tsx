"use client";
/** App-wide dialogs opened from many places (post menus, profiles, messages). */
import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lock } from "lucide-react";
import clsx from "clsx";
import { Dialog, DialogBody } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, DisplayName, ErrorState } from "@/components/ui/misc";
import { Spinner, UserSkeleton } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { get, post, put, del, errorMessage, newClientKey } from "@/lib/api";
import { compactCount } from "@/lib/format";
import type { ConversationDTO, ListDTO, UserDTO } from "@/lib/types";

type ReportTarget = { type: "POST" | "USER" | "MESSAGE" | "LIST"; id: string; label: string };

interface DialogsApi {
  report: (t: ReportTarget) => void;
  listMembership: (handle: string) => void;
  shareByMessage: (postId: string) => void;
  activity: (postId: string) => void;
}

const Ctx = createContext<DialogsApi | null>(null);

export function useDialogs(): DialogsApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDialogs outside DialogsProvider");
  return c;
}

export function DialogsProvider({ children }: { children: ReactNode }) {
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [membership, setMembership] = useState<string | null>(null);
  const [share, setShare] = useState<string | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  return (
    <Ctx.Provider value={{ report: setReport, listMembership: setMembership, shareByMessage: setShare, activity: setActivity }}>
      {children}
      {report && <ReportDialog target={report} onClose={() => setReport(null)} />}
      {membership && <ListMembershipDialog handle={membership} onClose={() => setMembership(null)} />}
      {share && <ShareByMessageDialog postId={share} onClose={() => setShare(null)} />}
      {activity && <ActivityDialog postId={activity} onClose={() => setActivity(null)} />}
    </Ctx.Provider>
  );
}

// ------------------------------------------------------------------------ report
const CATEGORIES: Record<ReportTarget["type"], { key: string; label: string; help: string }[]> = {
  POST: [
    { key: "not_interested", label: "I’m not interested in this post", help: "" },
    { key: "spam", label: "It’s suspicious or spam", help: "Fake engagement, scams, or repetitive content." },
    { key: "sensitive_media", label: "It displays a sensitive photo or video", help: "" },
    { key: "abusive", label: "It’s abusive or harmful", help: "Harassment, threats, or hateful conduct." },
    { key: "self_harm", label: "It expresses intentions of self-harm or suicide", help: "" },
    { key: "misleading", label: "It’s misleading", help: "" },
  ],
  USER: [
    { key: "spam", label: "They’re posting spam", help: "" },
    { key: "impersonation", label: "They’re pretending to be me or someone else", help: "" },
    { key: "abusive", label: "Their posts are abusive or hateful", help: "" },
    { key: "private_info", label: "They’re sharing private information", help: "" },
    { key: "self_harm", label: "They’re expressing intentions of self-harm or suicide", help: "" },
  ],
  MESSAGE: [
    { key: "spam", label: "It’s spam", help: "" },
    { key: "abusive", label: "It’s abusive or harmful", help: "" },
    { key: "sensitive_media", label: "It contains sensitive media", help: "" },
  ],
  LIST: [
    { key: "spam", label: "It’s spam", help: "" },
    { key: "abusive", label: "Its name or description is abusive", help: "" },
  ],
};

function ReportDialog({ target, onClose }: { target: ReportTarget; onClose: () => void }) {
  const [category, setCategory] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [step, setStep] = useState<"choose" | "details" | "done">("choose");
  const m = useMutation({ mutationFn: () => post<{ id: string; status: string; createdAt: string }>("/reports", { targetType: target.type, targetId: target.id, category, details }), onSuccess: () => setStep("done") });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={step === "done" ? "Report received" : `Report ${target.label}`} width={600} fullScreenMobile back={step === "details" ? () => setStep("choose") : undefined}>
      {step === "choose" && (
        <fieldset>
          <legend className="px-5 pt-4 text-heading font-extrabold">Help us understand the problem. What’s going on?</legend>
          <div className="mt-2">
            {CATEGORIES[target.type].map((c) => (
              <label key={c.key} className="flex cursor-pointer items-start gap-3 border-b border-line px-5 py-3 hover:bg-hover">
                <div className="flex-1">
                  <div>{c.label}</div>
                  {c.help && <div className="text-sm text-fg2">{c.help}</div>}
                </div>
                <input type="radio" name="category" value={c.key} checked={category === c.key} onChange={() => setCategory(c.key)} className="mt-1 h-[18px] w-[18px] accent-[var(--accent)]" />
              </label>
            ))}
          </div>
          <div className="flex justify-end px-5 py-4">
            <Button disabled={!category} onClick={() => setStep("details")}>
              Next
            </Button>
          </div>
        </fieldset>
      )}
      {step === "details" && (
        <DialogBody>
          <label htmlFor="report-details" className="font-bold">
            Anything else we should know? <span className="font-normal text-fg2">(optional)</span>
          </label>
          <textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value.slice(0, 1000))} rows={5} className="mt-2 w-full rounded border border-line-strong bg-transparent p-2 outline-none focus:border-accent-text" />
          <div className="text-right text-xs text-fg2">{details.length} / 1000</div>
          {m.isError && <p className="mt-2 text-danger" role="alert">{errorMessage(m.error)}</p>}
          <div className="mt-4 flex justify-end">
            <Button disabled={m.isPending} onClick={() => m.mutate()}>
              {m.isPending ? "Submitting…" : "Submit report"}
            </Button>
          </div>
        </DialogBody>
      )}
      {step === "done" && m.data && (
        <DialogBody>
          <p className="text-heading font-bold">Thanks for letting us know.</p>
          <p className="mt-2 text-fg2">
            Your report was saved (reference {m.data.id.slice(-8)}). It has been received but not reviewed, and no action has been taken yet. In this demo environment, reports are stored in your workspace; there is no live moderation team attached.
          </p>
          <p className="mt-2 text-fg2">If you don’t want to see this content, you can also mute or block the account.</p>
          <div className="mt-4 flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </DialogBody>
      )}
    </Dialog>
  );
}

// -------------------------------------------------------------- list membership
function ListMembershipDialog({ handle, onClose }: { handle: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["list-membership", handle], queryFn: () => get<{ list: ListDTO; isMember: boolean }[]>(`/users/${handle}/list-membership`) });
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const toggle = async (listId: string, on: boolean) => {
    setPending((p) => ({ ...p, [listId]: true }));
    try {
      if (on) await put(`/lists/${listId}/members/${handle}`);
      else await del(`/lists/${listId}/members/${handle}`);
      qc.setQueryData<{ list: ListDTO; isMember: boolean }[]>(["list-membership", handle], (old) => old?.map((r) => (r.list.id === listId ? { ...r, isMember: on } : r)));
      qc.invalidateQueries({ queryKey: ["lists"] });
      qc.invalidateQueries({ queryKey: ["list"] });
    } catch (e) {
      toast({ text: errorMessage(e), tone: "error" });
    } finally {
      setPending((p) => ({ ...p, [listId]: false }));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Pick a List" fullScreenMobile headerAction={<Button size="sm" variant="inverse" onClick={onClose} className="mr-2">Done</Button>}>
      <Link href="/i/lists/create" onClick={onClose} className="block border-b border-line px-4 py-4 text-accent-text hover:bg-hover">
        Create a new List
      </Link>
      {q.isPending && <UserSkeleton count={3} />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <p className="px-4 py-6 text-fg2">You haven’t created any Lists yet.</p>}
      {q.data?.map(({ list, isMember }) => (
        <button key={list.id} type="button" disabled={pending[list.id]} aria-pressed={isMember} onClick={() => toggle(list.id, !isMember)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover disabled:opacity-60">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-subtle">
            {list.bannerUrl && <img src={list.bannerUrl} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 font-bold">
              <span className="truncate">{list.name}</span>
              {list.isPrivate && <Lock size={14} aria-label="Private" />}
            </div>
            <div className="text-sm text-fg2">{list.memberCount} members</div>
          </div>
          {isMember && <Check size={20} className="text-accent-text" aria-label="Member" />}
        </button>
      ))}
    </Dialog>
  );
}

// ------------------------------------------------------------- share by message
function ShareByMessageDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<UserDTO[]>([]);
  const [text, setText] = useState("");
  const inbox = useQuery({ queryKey: ["conversations", "inbox"], queryFn: () => get<ConversationDTO[]>("/conversations?box=inbox") });
  const search = useQuery({ queryKey: ["dm-recipients", q], queryFn: () => get<{ user: UserDTO; canMessage: boolean; reason: string | null }[]>(`/dm/recipients?q=${encodeURIComponent(q)}`) });
  const [conv, setConv] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: async () => {
      let id = conv;
      if (!id) id = (await post<ConversationDTO>("/conversations", { handles: selected.map((u) => u.handle) })).id;
      await post(`/conversations/${id}/messages`, { text, mediaIds: [], sharedPostId: postId, clientKey: newClientKey() });
      return id;
    },
    onSuccess: (id) => {
      toast({ text: "Your post was sent", action: { label: "View", href: `/messages/${id}` } });
      onClose();
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Send Post" fullScreenMobile headerAction={<Button size="sm" className="mr-2" disabled={(!conv && !selected.length) || send.isPending} onClick={() => send.mutate()}>{send.isPending ? "Sending…" : "Send"}</Button>}>
      <div className="border-b border-line px-4 py-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setConv(null); }} placeholder="Search people" aria-label="Search people" className="w-full bg-transparent py-2 outline-none" />
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2">
            {selected.map((u) => (
              <button key={u.id} type="button" onClick={() => setSelected((s) => s.filter((x) => x.id !== u.id))} className="flex items-center gap-1 rounded-full border border-line-strong py-0.5 pl-0.5 pr-3 font-bold hover:bg-hover-strong">
                <Avatar user={u} size={22} /> {u.displayName} ×
              </button>
            ))}
          </div>
        )}
      </div>
      {!q && inbox.data && inbox.data.length > 0 && (
        <div>
          <p className="px-4 pt-3 text-sm font-bold text-fg2">Recent conversations</p>
          {inbox.data.slice(0, 6).map((c) => {
            const others = c.participants.filter((p) => p.active);
            return (
              <button key={c.id} type="button" disabled={!c.canSend} onClick={() => { setConv(c.id); setSelected([]); }} className={clsx("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover disabled:opacity-50", conv === c.id && "bg-accent-softer")}>
                <Avatar user={others[0] ?? null} size={40} />
                <span className="min-w-0 flex-1 truncate font-bold">{c.name ?? others.map((o) => o.displayName).join(", ")}</span>
                {conv === c.id && <Check size={18} className="text-accent-text" />}
              </button>
            );
          })}
        </div>
      )}
      {q && search.isPending && <Spinner className="py-4" />}
      {q &&
        search.data?.map((r) => (
          <button
            key={r.user.id}
            type="button"
            disabled={!r.canMessage}
            onClick={() => setSelected((s) => (s.some((x) => x.id === r.user.id) ? s : [...s, r.user]))}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover disabled:opacity-50"
          >
            <Avatar user={r.user} size={40} />
            <div className="min-w-0">
              <DisplayName user={r.user} />
              <div className="text-sm text-fg2">@{r.user.handle}{r.reason ? ` · ${r.reason}` : ""}</div>
            </div>
          </button>
        ))}
      <div className="border-t border-line px-4 py-3">
        <label htmlFor="share-comment" className="sr-only">Add a comment</label>
        <input id="share-comment" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" className="w-full bg-transparent outline-none" />
      </div>
    </Dialog>
  );
}

// --------------------------------------------------------------------- activity
interface Activity {
  likes: number;
  reposts: number;
  quotes: number;
  replies: number;
  bookmarks: number;
  detailOpens: number;
  last7Days: { day: string; engagements: number }[];
  recordedSince: string;
}

function ActivityDialog({ postId, onClose }: { postId: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["activity", postId], queryFn: () => get<Activity>(`/posts/${postId}/activity`) });
  const d = q.data;
  const max = d ? Math.max(1, ...d.last7Days.map((x) => x.engagements)) : 1;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Post activity" fullScreenMobile>
      {q.isPending && <Spinner className="py-8" />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {d && (
        <DialogBody>
          <p className="text-sm text-fg2">
            Counts come only from recorded events in this demo workspace. Impressions are not tracked, so none are shown. “Detail opens” counts distinct people who opened this post’s page, once per person per day.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3">
            {[
              ["Likes", d.likes],
              ["Reposts", d.reposts],
              ["Quote Posts", d.quotes],
              ["Replies", d.replies],
              ["Bookmarks", d.bookmarks],
              ["Detail opens", d.detailOpens],
            ].map(([k, v]) => (
              <div key={k} className="bg-bg p-4">
                <dt className="text-sm text-fg2">{k}</dt>
                <dd className="text-display font-extrabold">{compactCount(v as number)}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mt-6 font-bold">Likes and reposts, last 7 days</h3>
          <div className="mt-3 flex h-28 items-end gap-2" role="img" aria-label={d.last7Days.map((x) => `${x.day}: ${x.engagements}`).join(", ")}>
            {d.last7Days.map((x) => (
              <div key={x.day} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t bg-accent" style={{ height: `${(x.engagements / max) * 88}px`, minHeight: x.engagements ? 4 : 1, opacity: x.engagements ? 1 : 0.25 }} />
                <span className="text-xs text-fg2">{new Date(x.day + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short" })}</span>
              </div>
            ))}
          </div>
        </DialogBody>
      )}
    </Dialog>
  );
}
