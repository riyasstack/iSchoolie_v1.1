"use client";
import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Trash2, Pencil } from "lucide-react";
import { Dialog as R } from "radix-ui";
import { X } from "lucide-react";
import { Composer } from "./composer";
import { PageHeader } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, RouteTabs } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { del, get, errorMessage } from "@/lib/api";
import { formatInZone, relativeTime } from "@/lib/format";
import type { DraftDTO, ScheduledDTO } from "@/lib/types";

function useComposeParams() {
  const sp = useSearchParams();
  return { reply: sp.get("reply"), quote: sp.get("quote"), draft: sp.get("draft"), scheduled: sp.get("scheduled") };
}

/** Modal composer (intercepted /compose/post). Closing returns to the previous screen. */
export function ComposeModal() {
  const router = useRouter();
  const pathname = usePathname();
  const p = useComposeParams();
  const close = useRef<() => void>(() => router.back());
  // The intercepted slot keeps its state across soft navigations; only show on its own route.
  if (pathname !== "/compose/post") return null;
  return (
    <R.Root open onOpenChange={(o) => !o && close.current()}>
      <R.Portal>
        <R.Overlay className="motion-fade fixed inset-0 z-50 bg-overlay" />
        <R.Content
          aria-describedby={undefined}
          className="motion-pop fixed z-50 flex flex-col overflow-hidden bg-bg outline-none max-sm:inset-0 max-sm:h-dvh sm:left-1/2 sm:top-[5vh] sm:max-h-[90dvh] sm:w-[calc(100%-32px)] sm:max-w-[600px] sm:-translate-x-1/2 sm:rounded-card"
        >
          <ComposeChrome onClose={() => close.current()} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Composer
              mode="modal"
              replyToId={p.reply}
              quoteId={p.quote}
              draftId={p.draft}
              scheduledId={p.scheduled}
              registerClose={(fn) => (close.current = fn)}
              onDone={() => router.back()}
            />
          </div>
        </R.Content>
      </R.Portal>
    </R.Root>
  );
}

function ComposeChrome({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-[53px] shrink-0 items-center justify-between border-b border-line px-2">
      <button type="button" aria-label="Close" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-accent-text hover:bg-accent-soft">
        <X size={20} />
      </button>
      <R.Title className="sr-only">Compose post</R.Title>
      <Link href="/compose/drafts" className="rounded-full px-3 py-1.5 text-sm font-bold text-accent-text hover:bg-accent-soft">
        Unsent posts
      </Link>
    </div>
  );
}

/** Direct load of /compose/post: a full page composer with a meaningful header. */
export function ComposePage() {
  const router = useRouter();
  const p = useComposeParams();
  const close = useRef<() => void>(() => router.push("/home"));
  return (
    <div>
      <PageHeader title={p.reply ? "Reply" : p.quote ? "Quote Post" : p.scheduled ? "Edit scheduled post" : "Compose post"} back right={<Link href="/compose/drafts" className="text-sm font-bold text-accent-text hover:underline">Unsent posts</Link>} />
      <Composer mode="modal" replyToId={p.reply} quoteId={p.quote} draftId={p.draft} scheduledId={p.scheduled} registerClose={(fn) => (close.current = fn)} onDone={() => router.push("/home")} />
    </div>
  );
}

function UnsentTabs({ active }: { active: "drafts" | "scheduled" }) {
  return (
    <RouteTabs
      active={active}
      tabs={[
        { key: "drafts", label: "Drafts", href: "/compose/drafts" },
        { key: "scheduled", label: "Scheduled", href: "/compose/scheduled" },
      ]}
    />
  );
}

export function DraftsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["drafts"], queryFn: () => get<DraftDTO[]>("/drafts") });
  const [confirm, setConfirm] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => del(`/drafts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drafts"] });
      toast({ text: "Draft deleted" });
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  return (
    <div>
      <PageHeader title="Unsent posts" back />
      <UnsentTabs active="drafts" />
      {q.isPending && <Spinner className="py-8" />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title="You don’t have any drafts" body="When you save a post or leave one unfinished, it shows up here. Drafts are stored in your demo workspace." />}
      <ul>
        {q.data?.map((d) => (
          <li key={d.id} className="flex items-start gap-3 border-b border-line px-4 py-3 hover:bg-hover">
            <Link href={`/compose/post?draft=${d.id}`} className="min-w-0 flex-1">
              <p className="line-clamp-3 break-anywhere">{d.payload.items[0]?.text || <span className="text-fg2">(No text)</span>}</p>
              <p className="mt-1 text-sm text-fg2">
                {d.payload.items.length > 1 ? `Thread of ${d.payload.items.length} · ` : ""}
                {d.media.length ? `${d.media.length} attachment${d.media.length > 1 ? "s" : ""} · ` : ""}
                Saved {relativeTime(d.updatedAt)} ago
              </p>
            </Link>
            <Link href={`/compose/post?draft=${d.id}`} aria-label="Edit draft" className="grid h-9 w-9 place-items-center rounded-full text-accent-text hover:bg-accent-soft">
              <Pencil size={18} />
            </Link>
            <button type="button" aria-label="Delete draft" onClick={() => setConfirm(d.id)} className="grid h-9 w-9 place-items-center rounded-full text-danger hover:bg-like-soft">
              <Trash2 size={18} />
            </button>
          </li>
        ))}
      </ul>
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title="Delete draft?" body="This can’t be undone." confirmLabel="Delete" danger onConfirm={() => { if (confirm) remove.mutate(confirm); setConfirm(null); }} />
    </div>
  );
}

export function ScheduledPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["scheduled"], queryFn: () => get<ScheduledDTO[]>("/scheduled"), refetchInterval: 20_000 });
  const [confirm, setConfirm] = useState<string | null>(null);
  const cancel = useMutation({
    mutationFn: (id: string) => del(`/scheduled/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled"] });
      toast({ text: "Scheduled post canceled" });
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  const pending = q.data?.filter((s) => s.status === "PENDING") ?? [];
  const done = q.data?.filter((s) => s.status !== "PENDING") ?? [];
  return (
    <div>
      <PageHeader title="Unsent posts" back />
      <UnsentTabs active="scheduled" />
      {q.isPending && <Spinner className="py-8" />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data && pending.length === 0 && <EmptyState title="You don’t have any scheduled posts" body="Use the calendar button in the composer to pick a time. The server publishes scheduled posts even if your browser is closed." />}
      <ul>
        {pending.map((s) => (
          <li key={s.id} className="flex items-start gap-3 border-b border-line px-4 py-3 hover:bg-hover">
            <Link href={`/compose/post?scheduled=${s.id}`} className="min-w-0 flex-1">
              <p className="flex items-center gap-1 text-sm text-fg2">
                <CalendarClock size={14} /> Will send on {formatInZone(s.scheduledFor, s.timezone)}
              </p>
              <p className="mt-1 line-clamp-3 break-anywhere">{s.payload.items[0]?.text || "(No text)"}</p>
            </Link>
            <Link href={`/compose/post?scheduled=${s.id}`} aria-label="Edit or reschedule" className="grid h-9 w-9 place-items-center rounded-full text-accent-text hover:bg-accent-soft">
              <Pencil size={18} />
            </Link>
            <button type="button" aria-label="Cancel scheduled post" onClick={() => setConfirm(s.id)} className="grid h-9 w-9 place-items-center rounded-full text-danger hover:bg-like-soft">
              <Trash2 size={18} />
            </button>
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <section aria-label="Publication history">
          <h2 className="px-4 pb-2 pt-6 text-heading font-extrabold">Recently processed</h2>
          <ul>
            {done.map((s) => (
              <li key={s.id} className="border-b border-line px-4 py-3">
                <p className="text-sm text-fg2">
                  {s.status === "PUBLISHED" ? "Published" : s.status === "FAILED" ? "Couldn’t publish" : "Canceled"} · scheduled for {formatInZone(s.scheduledFor, s.timezone)}
                </p>
                <p className="mt-1 line-clamp-2 break-anywhere">{s.payload.items[0]?.text}</p>
                {s.status === "FAILED" && s.lastError && <p className="mt-1 text-sm text-danger">{s.lastError}</p>}
                {s.publishedPostId && (
                  <Link href={`/i/status/${s.publishedPostId}`} className="mt-1 inline-block text-sm text-accent-text hover:underline">
                    View post
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title="Cancel scheduled post?" body="It won’t be published. This can’t be undone." confirmLabel="Cancel post" cancelLabel="Keep it" danger onConfirm={() => { if (confirm) cancel.mutate(confirm); setConfirm(null); }} />
    </div>
  );
}
