"use client";
import Link from "next/link";
import { Fragment, useMemo } from "react";
import clsx from "clsx";
import { extractEntities, textDirection } from "@/lib/text";

/** Renders post text as React text nodes (never HTML), linking mentions, hashtags and safe URLs. */
export function RichText({ text, className, lang }: { text: string; className?: string; lang?: string | null }) {
  const entities = useMemo(() => extractEntities(text), [text]);
  const dir = useMemo(() => textDirection(text), [text]);
  return (
    <div dir={dir} lang={lang ?? undefined} className={clsx("whitespace-pre-wrap break-anywhere", className)}>
      {entities.map((e, i) => {
        if (e.type === "text") return <Fragment key={i}>{e.text}</Fragment>;
        if (e.type === "mention")
          return (
            <Link key={i} href={`/${e.handle}`} className="text-accent-text hover:underline" onClick={(ev) => ev.stopPropagation()}>
              {e.text}
            </Link>
          );
        if (e.type === "hashtag" || e.type === "cashtag")
          return (
            <Link key={i} href={`/search?q=${encodeURIComponent(e.type === "hashtag" ? `#${e.tag}` : `$${e.tag}`)}&src=hashtag_click`} className="text-accent-text hover:underline" onClick={(ev) => ev.stopPropagation()}>
              {e.text}
            </Link>
          );
        return (
          <a key={i} href={e.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-accent-text hover:underline" title={e.href} onClick={(ev) => ev.stopPropagation()}>
            {e.display}
          </a>
        );
      })}
    </div>
  );
}
