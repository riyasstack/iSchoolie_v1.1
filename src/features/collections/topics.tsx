"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import clsx from "clsx";
import { PageHeader } from "@/components/layout/app-shell";
import { EmptyState, ErrorState, SectionHeading } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { get, put, del, errorMessage, ApiError } from "@/lib/api";
import { Timeline } from "../timeline/timeline";
import type { TopicDTO } from "@/lib/types";

function useTopicFollow() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (t: TopicDTO) => (t.following ? del<TopicDTO>(`/topics/${t.slug}/follow`) : put<TopicDTO>(`/topics/${t.slug}/follow`)),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["topics"] });
      qc.setQueryData(["topic", t.slug], t);
      qc.invalidateQueries({ queryKey: ["timeline", "home"] });
      toast({ text: t.following ? `You’ll see posts about ${t.name} in Home.` : `You unfollowed ${t.name}.` });
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
}

export function TopicChip({ t }: { t: TopicDTO }) {
  const m = useTopicFollow();
  return (
    <span className={clsx("inline-flex items-center overflow-hidden rounded-full border", t.following ? "border-accent bg-accent text-accent-on" : "border-line-strong")}>
      <Link href={`/i/topics/${t.slug}`} className="py-1 pl-3 pr-2 font-bold hover:underline">
        {t.name}
      </Link>
      <button type="button" disabled={m.isPending} onClick={() => m.mutate(t)} aria-label={t.following ? `Unfollow topic ${t.name}` : `Follow topic ${t.name}`} className={clsx("grid h-8 w-8 place-items-center border-l", t.following ? "border-white/40" : "border-line-strong text-accent-text hover:bg-accent-soft")}>
        {t.following ? <Check size={16} /> : <Plus size={16} />}
      </button>
    </span>
  );
}

export function TopicsView() {
  const q = useQuery({ queryKey: ["topics"], queryFn: () => get<{ followed: TopicDTO[]; suggested: TopicDTO[] }>("/topics") });
  return (
    <div>
      <PageHeader title="Topics" back />
      {q.isPending && <Spinner className="py-8" />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data && (
        <>
          <SectionHeading>Followed Topics</SectionHeading>
          {q.data.followed.length === 0 ? (
            <p className="px-4 pb-4 text-fg2">You aren’t following any Topics yet. When you do, posts about them show up in Home.</p>
          ) : (
            <ul className="border-b border-line">
              {q.data.followed.map((t) => <TopicRow key={t.slug} t={t} />)}
            </ul>
          )}
          <SectionHeading>Suggested Topics</SectionHeading>
          <p className="-mt-2 px-4 pb-3 text-sm text-fg2">Suggestions are the demo’s topics you don’t follow yet, ordered by name.</p>
          <div className="flex flex-wrap gap-2 px-4 pb-6">{q.data.suggested.map((t) => <TopicChip key={t.slug} t={t} />)}</div>
        </>
      )}
    </div>
  );
}

function TopicRow({ t }: { t: TopicDTO }) {
  const m = useTopicFollow();
  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
      <Link href={`/i/topics/${t.slug}`} className="min-w-0 flex-1">
        <div className="font-bold">{t.name}</div>
        <div className="text-sm text-fg2">{t.category} · {t.description}</div>
      </Link>
      <Button size="sm" variant={t.following ? "primary" : "outline"} disabled={m.isPending} onClick={() => m.mutate(t)}>
        {t.following ? "Following" : "Follow"}
      </Button>
    </li>
  );
}

export function TopicView({ slug }: { slug: string }) {
  const q = useQuery({ queryKey: ["topic", slug], queryFn: () => get<TopicDTO>(`/topics/${slug}`) });
  const m = useTopicFollow();
  if (q.isError)
    return (
      <div>
        <PageHeader title="Topic" back />
        {q.error instanceof ApiError && q.error.status === 404 ? <EmptyState title="This Topic doesn’t exist" action={<Link href="/i/topics" className="text-accent-text">Browse Topics</Link>} /> : <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      </div>
    );
  const t = q.data;
  return (
    <div>
      <PageHeader title={t?.name ?? "Topic"} back />
      {t && (
        <div className="border-b border-line px-4 py-4">
          <h2 className="text-display font-extrabold">{t.name}</h2>
          <p className="mt-1 text-fg2">{t.description}</p>
          <p className="mt-1 text-sm text-fg2">{t.category} · {t.followerCount} follower{t.followerCount === 1 ? "" : "s"} in this demo</p>
          <Button className="mt-3" variant={t.following ? "primary" : "outline"} disabled={m.isPending} onClick={() => m.mutate(t)}>
            {t.following ? "Following" : "Follow"}
          </Button>
        </div>
      )}
      <Timeline queryKey={["topic-timeline", slug]} path={`/topics/${slug}/timeline`} empty={<EmptyState title="Nothing here yet" body="When people post about this Topic, their posts will show up here." />} />
    </div>
  );
}
