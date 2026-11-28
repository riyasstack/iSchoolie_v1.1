"use client";
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowUp } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useGlide } from "@/components/ui/glide";
import { useSession, applyPreferences } from "@/components/providers";
import { useToast } from "@/components/ui/toast";
import { get, patch, errorMessage } from "@/lib/api";
import { Composer } from "../compose/composer";
import { Timeline } from "./timeline";
import { CampusRail } from "./campus-rail";
import { PullToRefresh } from "./pull-to-refresh";
import { DemoNotice } from "../demo-controls";
import Link from "next/link";
import type { PreferencesDTO, SessionDTO, TimelinePage, UserDTO } from "@/lib/types";

type Mode = "home" | "latest";

const ORDERS: readonly [Mode, string, string][] = [
  ["home", "For you", "Ranked by people and interests you follow, recency and engagement"],
  ["latest", "Latest", "Newest first, nothing ranked"],
];

export function HomeView() {
  const s = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const mode = s.preferences.timelineMode;
  const key = ["timeline", mode] as const;
  const path = mode === "latest" ? "/timeline/latest" : "/timeline/home";
  // Posts newer than this moment count as "new" (reset whenever the Feed is refreshed).
  const [since, setSince] = useState(() => new Date().toISOString());

  const setMode = async (m: Mode) => {
    qc.setQueryData<SessionDTO>(["session"], (old) => (old ? { ...old, preferences: { ...old.preferences, timelineMode: m } } : old));
    try {
      const p = await patch<PreferencesDTO>("/me/preferences", { timelineMode: m });
      qc.setQueryData<SessionDTO>(["session"], (old) => (old ? { ...old, preferences: p } : old));
      applyPreferences(p);
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast({ text: m === "latest" ? "Showing the newest posts first." : "Showing posts picked for you." });
    } catch (e) {
      qc.invalidateQueries({ queryKey: ["session"] });
      toast({ text: errorMessage(e), tone: "error" });
    }
  };

  /** Reloads the first page in place (no skeleton flash) and resets the new-posts counter. */
  const refresh = useCallback(async () => {
    setSince(new Date().toISOString());
    qc.removeQueries({ queryKey: ["new-posts"] });
    qc.setQueryData<InfiniteData<TimelinePage, string | null>>(key, (old) => (old ? { pages: old.pages.slice(0, 1), pageParams: old.pageParams.slice(0, 1) } : old));
    await qc.refetchQueries({ queryKey: key, exact: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, mode]);

  return (
    <div>
      <PullToRefresh onRefresh={refresh} />
      <PageHeader title="Feed" topLevel right={<FeedOrder mode={mode} onChange={setMode} />} />
      <DemoNotice />
      <CampusRail timelineKey={key} path={path} />
      <div className="hidden sm:block">
        <Composer mode="inline" />
      </div>
      <NewPostsPill since={since} onShow={refresh} />
      <Timeline
        queryKey={key}
        path={path}
        empty={
          <EmptyState
            title="Welcome to iSchoolie!"
            body="Your Feed fills up as you follow classmates, clubs and interests."
            action={
              <Link href="/i/connect">
                <Button size="lg">Let’s go!</Button>
              </Link>
            }
          />
        }
      />
    </div>
  );
}

/** "For you" / "Latest" segmented control with a pill that glides between the two. */
function FeedOrder({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const glide = useGlide<HTMLDivElement>(mode, { className: "rounded-lg bg-bg shadow-sm" });
  return (
    <div ref={glide.ref} role="group" aria-label="Feed order" className="relative flex rounded-xl bg-subtle p-1 text-sm font-semibold">
      {glide.pill}
      {ORDERS.map(([m, label, hint]) => (
        <button
          key={m}
          type="button"
          data-glide={m}
          aria-pressed={mode === m}
          title={hint}
          onClick={() => mode !== m && onChange(m)}
          className={clsx("press relative z-[1] rounded-lg px-3 py-1", mode === m ? "text-accent-text" : "text-fg2 hover:text-fg")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Controlled "Show new posts": polls for newer posts; never moves the reader on its own. */
function NewPostsPill({ since, onShow }: { since: string; onShow: () => Promise<void> }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const q = useQuery({
    queryKey: ["new-posts", since],
    queryFn: () => get<{ count: number; authors: UserDTO[] }>(`/timeline/new?since=${encodeURIComponent(since)}`),
    enabled: visible,
    refetchInterval: 30_000,
  });
  if (!q.data?.count) return null;
  return (
    <div className="chrome-follow pointer-events-none sticky top-[60px] z-20 flex justify-center">
      <button
        type="button"
        data-new-posts
        onClick={async () => {
          window.scrollTo({ top: 0, behavior: "smooth" });
          await onShow();
        }}
        className="motion-slide-up press pointer-events-auto flex items-center gap-2 rounded-full bg-accent py-1.5 pl-3 pr-4 font-bold text-accent-on shadow-md hover:bg-accent-hover"
        aria-label={`Show ${q.data.count} new posts`}
      >
        <ArrowUp size={16} />
        <span className="flex -space-x-2">
          {q.data.authors.map((a) => (
            <Avatar key={a.id} user={a} size={22} className="ring-2 ring-accent" />
          ))}
        </span>
        Show {q.data.count} new post{q.data.count === 1 ? "" : "s"}
      </button>
    </div>
  );
}
