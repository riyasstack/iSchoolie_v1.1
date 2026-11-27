"use client";
import Link from "next/link";
import { useIsGuest } from "@/components/providers";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, Bookmark, BookmarkCheck, SlidersHorizontal } from "lucide-react";
import { PageHeader, TrendRow } from "@/components/layout/app-shell";
import { ButtonTabs, EmptyState, ErrorState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { get, put, del, errorMessage } from "@/lib/api";
import { buildQueryFromAdvanced, type AdvancedFields } from "@/lib/search-query";
import { SearchBox } from "./search-box";
import { Timeline } from "../timeline/timeline";
import { PeopleList } from "../posts/detail";
import { TopicChip } from "../collections/topics";
import type { MomentDTO, TopicDTO, TrendDTO } from "@/lib/types";

const CATEGORIES = [
  { key: "for-you", label: "For you" },
  { key: "trending", label: "Buzzing" },
  { key: "Learning", label: "Learning" },
  { key: "Science", label: "Science" },
  { key: "Sports", label: "Sports" },
  { key: "Arts", label: "Arts" },
  { key: "Community", label: "Community" },
  { key: "Games", label: "Games" },
] as const;

export function ExploreView() {
  const sp = useSearchParams();
  const router = useRouter();
  const tab = (sp.get("tab") ?? "for-you") as string;
  const trends = useQuery({ queryKey: ["trends", tab], queryFn: () => get<TrendDTO[]>(`/explore/trends?category=${encodeURIComponent(tab)}`) });
  const moments = useQuery({ queryKey: ["moments"], queryFn: () => get<{ mine: MomentDTO[]; discover: MomentDTO[] }>("/moments"), enabled: tab === "for-you" });
  const topics = useQuery({ queryKey: ["topics"], queryFn: () => get<{ followed: TopicDTO[]; suggested: TopicDTO[] }>("/topics"), enabled: tab === "for-you" });
  const story = moments.data?.discover[0];
  return (
    <div>
      <PageHeader topLevel border={false} right={<Link href="/settings/content" aria-label="Discover settings" className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl text-accent-text hover:bg-accent-soft"><Settings size={20} /></Link>}>
        <div className="min-w-0 flex-1 py-1">
          <SearchBox />
        </div>
      </PageHeader>
      <ButtonTabs label="Discover categories" tabs={CATEGORIES.map((c) => ({ key: c.key, label: c.label }))} active={tab as (typeof CATEGORIES)[number]["key"]} onChange={(k) => router.replace(`/explore?tab=${encodeURIComponent(k)}`, { scroll: false })} />
      {/* Reserve the story's space while loading so the buzzing interests below don't shift. */}
      {tab === "for-you" && moments.isPending && <div className="skeleton aspect-[2/1] max-h-[300px] w-full" aria-hidden="true" />}
      {tab === "for-you" && story && (
        <Link href={`/i/moments/${story.id}`} className="relative block aspect-[2/1] max-h-[300px] w-full overflow-hidden border-b border-line bg-subtle">
          {story.coverUrl && <img src={story.coverUrl} alt="" className="h-full w-full object-cover" />}
          <div className="absolute inset-x-0 bottom-0 bg-black/60 p-4 text-white">
            <div className="text-sm">Moment · {story.owner.displayName}</div>
            <div className="text-title font-extrabold">{story.title}</div>
          </div>
        </Link>
      )}
      <section aria-label="Buzzing">
        <h2 className="px-4 pb-1 pt-3 text-heading font-extrabold">{tab === "for-you" ? "Buzzing for you" : tab === "trending" ? "Buzzing in this demo" : `${tab}`}</h2>
        <p className="px-4 pb-2 text-xs text-fg2">“Measured” buzzing interests are hashtags counted from posts in your demo workspace over the last 7 days. “Curated” buzzing interests are editorial picks for the demo.</p>
        {trends.isPending && (
          <div aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="space-y-1.5 border-t border-line px-4 py-3">
                <div className="skeleton h-3 w-1/3 rounded" />
                <div className="skeleton h-4 w-1/2 rounded" />
                <div className="skeleton h-3 w-1/5 rounded" />
              </div>
            ))}
          </div>
        )}
        {trends.isError && <ErrorState message={errorMessage(trends.error)} onRetry={() => trends.refetch()} />}
        {trends.data?.length === 0 && <EmptyState title="No buzzing interests here yet" body="Topics start buzzing when several people post about the same thing." />}
        {!!trends.data?.length && <div className="border-b border-line">{trends.data.map((t, i) => <TrendRow key={t.key} t={t} rank={i + 1} />)}</div>}
      </section>
      {/* Rendered only after trends so it can't be pushed down when they arrive. */}
      {tab === "for-you" && trends.data && topics.data && topics.data.suggested.length > 0 && (
        <section aria-label="Interests to follow" className="border-b border-line px-4 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-heading font-extrabold">Interests to follow</h2>
            <Link href="/i/topics" className="text-sm text-accent-text hover:underline">See all</Link>
          </div>
          <p className="text-sm text-fg2">Following an interest adds matching posts to your Feed.</p>
          <div className="mt-3 flex flex-wrap gap-2">{topics.data.suggested.slice(0, 8).map((t) => <TopicChip key={t.slug} t={t} />)}</div>
        </section>
      )}
    </div>
  );
}

const SEARCH_TABS = [
  { key: "top", label: "Top" },
  { key: "live", label: "Latest" },
  { key: "user", label: "People" },
  { key: "image", label: "Photos" },
  { key: "video", label: "Videos" },
] as const;

export function SearchView() {
  const sp = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const q = sp.get("q") ?? "";
  const f = (sp.get("f") ?? "top") as (typeof SEARCH_TABS)[number]["key"];
  const guest = useIsGuest();
  const history = useQuery({ queryKey: ["search-history"], queryFn: () => get<{ saved: { query: string }[] }>("/search/history"), enabled: !guest });
  const saved = !!history.data?.saved.some((s) => s.query === q.trim());
  const save = useMutation({
    mutationFn: () => (saved ? del("/search/saved", { query: q }) : put("/search/saved", { query: q })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["search-history"] });
      toast({ text: saved ? "Saved search removed" : "Search saved" });
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  return (
    <div>
      <PageHeader back="/explore" border={false} right={
        <div className="flex">
          {q && (
            <button type="button" onClick={() => save.mutate()} aria-label={saved ? "Remove saved search" : "Save search"} title={saved ? "Remove saved search" : "Save search"} className="grid h-[34px] w-[34px] place-items-center rounded-xl text-accent-text hover:bg-accent-soft">
              {saved ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
            </button>
          )}
          <Link href={`/search-advanced${q ? `?q=${encodeURIComponent(q)}` : ""}`} aria-label="Advanced search" title="Advanced search" className="grid h-[34px] w-[34px] place-items-center rounded-xl text-accent-text hover:bg-accent-soft">
            <SlidersHorizontal size={20} />
          </Link>
        </div>
      }>
        <div className="min-w-0 flex-1 py-1">
          <SearchBox initial={q} />
        </div>
      </PageHeader>
      <ButtonTabs label="Search results" tabs={SEARCH_TABS.map((t) => ({ key: t.key, label: t.label }))} active={f} onChange={(k) => router.replace(`/search?q=${encodeURIComponent(q)}&f=${k}`, { scroll: false })} />
      {!q.trim() ? (
        <EmptyState title="Search iSchoolie" body="Find people, hashtags, interests and posts. Try “#astronomy”, “from:prof_lindqvist”, or “robot filter:images”." />
      ) : f === "user" ? (
        <PeopleList queryKey={["search", q, "user"]} path={`/search?q=${encodeURIComponent(q)}&f=user`} empty={`No results for “${q}”`} emptyBody="Try searching for something else, or check your spelling." />
      ) : (
        <Timeline
          key={`${q}-${f}`}
          queryKey={["search", q, f]}
          path={`/search?q=${encodeURIComponent(q)}&f=${f}`}
          empty={<EmptyState title={`No results for “${q}”`} body={<>The term you entered did not bring up any results. Try a different search, or use <Link className="text-accent-text" href={`/search-advanced?q=${encodeURIComponent(q)}`}>advanced search</Link>.</>} />}
        />
      )}
    </div>
  );
}

const EMPTY_FIELDS: AdvancedFields = { allWords: "", phrase: "", anyWords: "", noneWords: "", hashtags: "", from: "", to: "", mentioning: "", since: "", until: "", minFaves: "", minReplies: "", minReposts: "", replies: "include", links: false, media: "any", lang: "" };

export function AdvancedSearchView() {
  const router = useRouter();
  const sp = useSearchParams();
  const [f, setF] = useState<AdvancedFields>({ ...EMPTY_FIELDS, allWords: sp.get("q") ?? "" });
  const query = buildQueryFromAdvanced(f);
  const field = (k: keyof AdvancedFields, label: string, hint?: string, type = "text") => (
    <label className="block px-4 py-2">
      <span className="block rounded border border-line-strong px-2 pt-1 focus-within:border-accent-text">
        <span className="text-xs text-fg2">{label}</span>
        <input type={type} value={f[k] as string} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="w-full bg-transparent pb-2 outline-none" />
      </span>
      {hint && <span className="mt-1 block text-xs text-fg2">{hint}</span>}
    </label>
  );
  return (
    <div>
      <PageHeader title="Advanced search" back right={<Button size="sm" disabled={!query} onClick={() => router.push(`/search?q=${encodeURIComponent(query)}&f=live`)}>Search</Button>} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query) router.push(`/search?q=${encodeURIComponent(query)}&f=live`);
        }}
      >
        <h2 className="px-4 pt-4 font-extrabold">Words</h2>
        {field("allWords", "All of these words", "Example: what’s happening · contains both “what’s” and “happening”")}
        {field("phrase", "This exact phrase", "Example: happy hour · contains the exact phrase “happy hour”")}
        {field("anyWords", "Any of these words", "Example: cats dogs · contains either “cats” or “dogs” (or both)")}
        {field("noneWords", "None of these words", "Example: cats dogs · does not contain “cats” and does not contain “dogs”")}
        {field("hashtags", "These hashtags", "Example: #FirstPost")}
        <label className="block px-4 py-2">
          <span className="block rounded border border-line-strong px-2 pt-1">
            <span className="text-xs text-fg2">Language</span>
            <select value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value })} className="w-full bg-transparent pb-2 outline-none">
              <option value="" className="bg-bg">Any language</option>
              {[["en", "English"], ["es", "Spanish"], ["fr", "French"], ["ar", "Arabic"], ["ja", "Japanese"], ["hi", "Hindi"], ["it", "Italian"]].map(([c, n]) => (
                <option key={c} value={c} className="bg-bg">{n}</option>
              ))}
            </select>
          </span>
        </label>
        <h2 className="px-4 pt-4 font-extrabold">Accounts</h2>
        {field("from", "From these accounts", "Example: @robotics_club · sent from @robotics_club")}
        {field("to", "To these accounts", "Example: @maya_learns · sent in reply to @maya_learns")}
        {field("mentioning", "Mentioning these accounts", "Example: @stargazer_sam · mentions @stargazer_sam")}
        <h2 className="px-4 pt-4 font-extrabold">Filters</h2>
        <fieldset className="px-4 py-2">
          <legend className="text-sm text-fg2">Replies</legend>
          {(["include", "only", "exclude"] as const).map((v) => (
            <label key={v} className="mr-4 inline-flex items-center gap-2 py-1">
              <input type="radio" name="replies" checked={f.replies === v} onChange={() => setF({ ...f, replies: v })} className="accent-[var(--accent)]" />
              {v === "include" ? "Include replies and original posts" : v === "only" ? "Only show replies" : "Exclude replies"}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2 px-4 py-2">
          <input type="checkbox" checked={f.links} onChange={(e) => setF({ ...f, links: e.target.checked })} className="accent-[var(--accent)]" /> Only show posts with links
        </label>
        <label className="block px-4 py-2">
          <span className="block rounded border border-line-strong px-2 pt-1">
            <span className="text-xs text-fg2">Media</span>
            <select value={f.media} onChange={(e) => setF({ ...f, media: e.target.value as AdvancedFields["media"] })} className="w-full bg-transparent pb-2 outline-none">
              <option value="any" className="bg-bg">With or without media</option>
              <option value="media" className="bg-bg">Any media</option>
              <option value="images" className="bg-bg">Photos and GIFs</option>
              <option value="videos" className="bg-bg">Videos</option>
            </select>
          </span>
        </label>
        <h2 className="px-4 pt-4 font-extrabold">Engagement</h2>
        {field("minReplies", "Minimum replies", undefined, "number")}
        {field("minFaves", "Minimum cheers", undefined, "number")}
        {field("minReposts", "Minimum shares", undefined, "number")}
        <h2 className="px-4 pt-4 font-extrabold">Dates</h2>
        <div className="grid grid-cols-2">
          {field("since", "From", undefined, "date")}
          {field("until", "To (exclusive)", undefined, "date")}
        </div>
        <div className="sticky bottom-0 border-t border-line bg-bg px-4 py-3">
          <p className="mb-2 break-anywhere text-sm text-fg2">Query: <code className="text-fg">{query || "—"}</code></p>
          <Button type="submit" disabled={!query} full>Search</Button>
        </div>
      </form>
    </div>
  );
}
