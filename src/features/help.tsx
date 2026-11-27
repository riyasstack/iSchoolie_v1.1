"use client";
import Link from "next/link";
import { PageHeader } from "@/components/layout/app-shell";
import { SHORTCUTS } from "./shortcuts";

const SECTIONS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "demo-mode",
    title: "About demo mode",
    body: (
      <>
        <p>iSchoolie is running as an isolated demo. When you first open it, the server creates a private workspace for your browser session and fills it with fictional people, posts, messages and circles. Nothing you do is visible to other visitors, and their workspaces are invisible to you.</p>
        <p>Your workspace is kept for a limited time after your last visit (see Settings → Demo environment) and then deleted, including uploads. The session is anonymous: it isn’t an account and can’t be restored on another device.</p>
        <p>Demo-only testing controls let you switch between the seeded fictional identities and reset the workspace. Those controls will not exist once real sign-in is connected.</p>
      </>
    ),
  },
  {
    id: "timeline",
    title: "Home and Latest",
    body: (
      <>
        <p><b>Feed</b> shows recent posts (last 14 days) from you, people you follow, reposts by people you follow, posts matching Topics you follow, and posts liked by at least two people you follow. They’re ordered by a simple, documented score: recency (half-life of 18 hours) multiplied by an engagement boost and a weight for the source. It isn’t a recreation of any proprietary ranking algorithm.</p>
        <p><b>Latest</b> shows only posts from you and people you follow (and their reposts), newest first, with no recommendations. Switch with the ✦ button on Home.</p>
        <p>Both respect blocks, mutes and muted words. New posts never push the timeline down by themselves — use “Show new posts”.</p>
      </>
    ),
  },
  {
    id: "posting",
    title: "Posting",
    body: (
      <>
        <p>Posts are limited to 280 characters using the legacy weighted count (links count as 23; many emoji and CJK characters count as 2). You can attach up to 4 photos, or 1 GIF, or 1 video, or add a poll (2–4 choices, 5 minutes to 7 days). Polls can’t be combined with media.</p>
        <p>Choose who can reply: everyone, people you follow, or only people you mention. Published posts can’t be edited; delete and post again instead. Unfinished posts are autosaved to Drafts, and scheduled posts are published by the server even if you close your browser.</p>
      </>
    ),
  },
  {
    id: "privacy",
    title: "Privacy and safety",
    body: (
      <>
        <p><b>Protected posts</b> are visible only to approved followers — in timelines, search, quotes, media links and Stories. Protected posts can’t be shared.</p>
        <p><b>Blocking</b> stops someone from following you, seeing your posts, replying, or messaging you, and removes follows between you. <b>Muting</b> only changes what you see; the muted person isn’t told.</p>
        <p><b>Reports</b> are saved in your workspace with a reference number. Submitting a report doesn’t mean any action has been taken; there’s no live moderation team in this demo.</p>
        <p><b>Inbox:</b> messages from people you don’t follow arrive as requests. Deleting a message removes it only for you.</p>
      </>
    ),
  },
  {
    id: "trends",
    title: "Buzzing",
    body: <p>Trends labelled “Measured in this demo” are hashtags counted from posts in your workspace over the last 7 days (by at least two people). Trends labelled “Curated for this demo” are editorial entries; the post counts shown are real matches in your workspace.</p>,
  },
];

export function HelpView() {
  return (
    <div>
      <PageHeader title="Help Center" back />
      <nav aria-label="Help interests" className="border-b border-line px-4 py-3">
        <ul className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-block rounded-xl border border-line-strong px-3 py-1 text-sm font-semibold hover:bg-hover-strong">{s.title}</a>
            </li>
          ))}
          <li>
            <a href="#shortcuts" className="inline-block rounded-xl border border-line-strong px-3 py-1 text-sm font-semibold hover:bg-hover-strong">Keyboard shortcuts</a>
          </li>
        </ul>
      </nav>
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-[60px] space-y-3 border-b border-line px-4 py-5">
          <h2 className="text-title font-extrabold">{s.title}</h2>
          <div className="space-y-3 text-post">{s.body}</div>
        </section>
      ))}
      <section id="shortcuts" className="scroll-mt-[60px] border-b border-line px-4 py-5">
        <h2 className="text-title font-extrabold">Keyboard shortcuts</h2>
        <p className="mt-2 text-fg2">Press <kbd className="rounded bg-subtle px-1.5 font-bold">?</kbd> anywhere to open the shortcuts dialog.</p>
        {SHORTCUTS.map((g) => (
          <div key={g.group} className="mt-3">
            <h3 className="font-bold">{g.group}</h3>
            <p className="text-fg2">{g.items.map(([k, l]) => `${k} — ${l}`).join(" · ")}</p>
          </div>
        ))}
      </section>
      <p className="px-4 py-6 text-sm text-fg2">Still stuck? Visit <Link href="/settings" className="text-accent-text">Settings</Link> or reset your demo from Settings → Demo environment.</p>
    </div>
  );
}
