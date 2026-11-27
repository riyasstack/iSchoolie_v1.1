"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, Menu, MenuItem, RouteTabs } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserSkeleton } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/components/providers";
import { del, get, post, errorMessage } from "@/lib/api";
import { Timeline } from "../timeline/timeline";
import { UserCell } from "../profiles/people";
import { relativeTime } from "@/lib/format";
import type { UserListItem } from "@/lib/types";

export function BookmarksView() {
  const s = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const clear = useMutation({
    mutationFn: () => del<{ removed: number }>("/bookmarks"),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
      qc.invalidateQueries({ queryKey: ["post"] });
      toast({ text: `Cleared ${r.removed} bookmark${r.removed === 1 ? "" : "s"}` });
      setConfirm(false);
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  return (
    <div>
      <PageHeader
        title="Saved"
        subtitle={`@${s.actor.handle}`}
        back
        right={
          <Menu label="More" trigger={<button type="button" aria-label="More" className="grid h-[34px] w-[34px] place-items-center rounded-xl text-accent-text hover:bg-accent-soft"><MoreHorizontal size={20} /></button>}>
            <MenuItem icon={<Trash2 />} danger onSelect={() => setConfirm(true)}>Clear all Saved</MenuItem>
          </Menu>
        }
      />
      <Timeline
        queryKey={["bookmarks"]}
        path="/bookmarks"
        empty={<EmptyState title="You haven’t added any posts to your Saved yet" body="When you do, they’ll show up here. Use Send → Save post on any post." />}
      />
      <p className="px-4 py-4 text-center text-xs text-fg2">Saved posts are private. Posts that are deleted or become unavailable to you are skipped.</p>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Clear all Saved?" body="This can’t be undone and you’ll remove all posts you’ve added to your Saved." confirmLabel="Clear" danger busy={clear.isPending} onConfirm={() => clear.mutate()} />
    </div>
  );
}

export function ConnectView() {
  const q = useQuery({ queryKey: ["suggestions", 20], queryFn: () => get<UserListItem[]>("/suggestions?limit=20") });
  return (
    <div>
      <PageHeader title="Connect" back />
      <p className="border-b border-line px-4 py-3 text-sm text-fg2">Suggested for you: accounts followed by people you follow, then other active accounts in this demo. Accounts you follow, blocked or muted accounts are excluded.</p>
      {q.isPending && <UserSkeleton count={6} />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title="No suggestions right now" body="You’re following everyone we’d suggest." />}
      {q.data?.map((it) => <UserCell key={it.user.id} item={it} />)}
    </div>
  );
}

interface RequestRow extends UserListItem {
  id: string;
  createdAt: string;
}

export function FollowerRequestsView() {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const q = useQuery({ queryKey: ["follow-requests"], queryFn: () => get<{ incoming: RequestRow[]; outgoing: RequestRow[] }>("/follow-requests") });
  const respond = useMutation({
    mutationFn: ({ handle, accept }: { handle: string; accept: boolean }) => post(`/follow-requests/${handle}/${accept ? "accept" : "reject"}`),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["follow-requests"] });
      qc.invalidateQueries({ queryKey: ["badges"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast({ text: v.accept ? `@${v.handle} can now see your posts` : `Request from @${v.handle} declined` });
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  const cancel = useMutation({
    mutationFn: (handle: string) => del(`/users/${handle}/follow`),
    onSuccess: (_r, h) => {
      qc.invalidateQueries({ queryKey: ["follow-requests"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast({ text: `Request to @${h} canceled` });
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  const rows = q.data?.[tab] ?? [];
  return (
    <div>
      <PageHeader title="Follower requests" back />
      <div role="tablist" aria-label="Requests" className="flex border-b border-line">
        {(["incoming", "outgoing"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`flex min-h-[53px] flex-1 items-center justify-center font-bold hover:bg-accent-softer ${tab === t ? "text-accent-text" : "text-fg2"}`}>
            <span className="relative flex h-full items-center">
              {t === "incoming" ? "Received" : "Sent"} {q.data ? `(${q.data[t].length})` : ""}
              {tab === t && <span className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-accent" />}
            </span>
          </button>
        ))}
      </div>
      {q.isPending && <UserSkeleton count={3} />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data && rows.length === 0 && (
        <EmptyState title={tab === "incoming" ? "You don’t have any follower requests" : "You haven’t sent any requests"} body={tab === "incoming" ? "When your posts are protected, people who want to follow you appear here for approval." : "Requests you send to protected accounts appear here until they respond."} />
      )}
      {rows.map((r) => (
        <UserCell
          key={r.id}
          item={r}
          action={
            tab === "incoming" ? (
              <div className="flex gap-2">
                <Button size="sm" disabled={respond.isPending} onClick={() => respond.mutate({ handle: r.user.handle, accept: true })}>Accept</Button>
                <Button size="sm" variant="neutral" disabled={respond.isPending} onClick={() => respond.mutate({ handle: r.user.handle, accept: false })}>Decline</Button>
              </div>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <Button size="sm" variant="neutral" disabled={cancel.isPending} onClick={() => cancel.mutate(r.user.handle)}>Cancel</Button>
                <span className="text-xs text-fg2">Sent {relativeTime(r.createdAt)} ago</span>
              </div>
            )
          }
        />
      ))}
    </div>
  );
}

export { RouteTabs };
