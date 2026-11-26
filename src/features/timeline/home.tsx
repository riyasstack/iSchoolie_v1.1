"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, ArrowUp } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { Menu, MenuItem, EmptyState } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useSession, applyPreferences } from "@/components/providers";
import { useToast } from "@/components/ui/toast";
import { get, patch, errorMessage } from "@/lib/api";
import { Composer } from "../compose/composer";
import { Timeline } from "./timeline";
import { DemoNotice } from "../demo-controls";
import Link from "next/link";
import type { PreferencesDTO, SessionDTO, UserDTO } from "@/lib/types";

export function HomeView() {
  const s = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const mode = s.preferences.timelineMode;
  const key = ["timeline", mode] as const;

  const setMode = async (m: "home" | "latest") => {
    qc.setQueryData<SessionDTO>(["session"], (old) => (old ? { ...old, preferences: { ...old.preferences, timelineMode: m } } : old));
    try {
      const p = await patch<PreferencesDTO>("/me/preferences", { timelineMode: m });
      qc.setQueryData<SessionDTO>(["session"], (old) => (old ? { ...old, preferences: p } : old));
      applyPreferences(p);
      window.scrollTo({ top: 0 });
      toast({ text: m === "latest" ? "You’ll see the latest posts first." : "You’ll see top posts first." });
    } catch (e) {
      qc.invalidateQueries({ queryKey: ["session"] });
      toast({ text: errorMessage(e), tone: "error" });
    }
  };

  return (
    <div>
      <PageHeader
        title={mode === "latest" ? "Latest Posts" : "Home"}
        topLevel
        right={
          <Menu
            label="Timeline options"
            trigger={
              <button type="button" aria-label="Top Posts / Latest Posts" title="Timeline options" className="grid h-[34px] w-[34px] place-items-center rounded-full text-accent-text hover:bg-accent-soft">
                <Sparkles size={20} />
              </button>
            }
          >
            {mode === "home" ? (
              <MenuItem icon={<Sparkles />} onSelect={() => setMode("latest")}>
                <span className="block font-bold">See latest Posts instead</span>
                <span className="block text-sm text-fg2">You’ll be switched back Home after you’ve been away for a while.</span>
              </MenuItem>
            ) : (
              <MenuItem icon={<Sparkles />} onSelect={() => setMode("home")}>
                <span className="block font-bold">Go back Home</span>
                <span className="block text-sm text-fg2">You’ll see top Posts first.</span>
              </MenuItem>
            )}
            <div className="border-t border-line px-4 py-2 text-xs text-fg2">
              Home ranks recent posts from people and topics you follow by recency and engagement. Latest is strictly newest first. <Link href="/help#timeline" className="text-accent-text">How it works</Link>
            </div>
          </Menu>
        }
      />
      <DemoNotice />
      <div className="hidden sm:block">
        <Composer mode="inline" />
      </div>
      <NewPostsPill timelineKey={key} />
      <Timeline
        queryKey={key}
        path={mode === "latest" ? "/timeline/latest" : "/timeline/home"}
        empty={
          <EmptyState
            title="Welcome to iSchoolie!"
            body="This is the best place to see what’s happening. Follow some people and topics to fill your timeline."
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

/** Controlled "Show new posts": polls for newer posts; never moves the reader on its own. */
function NewPostsPill({ timelineKey }: { timelineKey: readonly unknown[] }) {
  const qc = useQueryClient();
  // Posts newer than the moment this timeline was loaded (reset when the reader asks for them).
  const [since, setSince] = useState(() => new Date().toISOString());
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
    <div className="pointer-events-none sticky top-[60px] z-20 flex justify-center">
      <button
        type="button"
        data-new-posts
        onClick={async () => {
          window.scrollTo({ top: 0 });
          setSince(new Date().toISOString());
          qc.removeQueries({ queryKey: ["new-posts"] });
          await qc.resetQueries({ queryKey: timelineKey });
        }}
        className="motion-slide-up pointer-events-auto flex items-center gap-2 rounded-full bg-accent py-1.5 pl-3 pr-4 font-bold text-accent-on shadow-md hover:bg-accent-hover"
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
