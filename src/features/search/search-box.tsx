"use client";
/** Search field with debounced typeahead, recent and saved searches. */
import { useEffect, useId, useRef, useState } from "react";
import { useIsGuest } from "@/components/providers";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X, Clock, Hash, MessageSquareText, Bookmark } from "lucide-react";
import clsx from "clsx";
import { del, get } from "@/lib/api";
import { Avatar, DisplayName } from "@/components/ui/misc";
import type { UserDTO } from "@/lib/types";

interface History {
  recent: { id: string; query: string }[];
  saved: { id: string; query: string }[];
}
interface Typeahead {
  users: UserDTO[];
  hashtags: { tag: string; count: number }[];
  topics: { slug: string; name: string }[];
}

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function SearchBox({ initial = "", autoFocus }: { initial?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [value, setValue] = useState(initial);
  const guest = useIsGuest();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebounced(value.trim(), 200);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => setValue(initial), [initial]);
  const history = useQuery({ queryKey: ["search-history"], queryFn: () => get<History>("/search/history"), enabled: open && !guest });
  const ta = useQuery({ queryKey: ["typeahead", debounced], queryFn: () => get<Typeahead>(`/search/typeahead?q=${encodeURIComponent(debounced)}`), enabled: open && debounced.length > 0, staleTime: 30_000 });

  type Opt = { key: string; href: string; render: React.ReactNode };
  const options: Opt[] = [];
  if (debounced) {
    options.push({ key: "q", href: `/search?q=${encodeURIComponent(debounced)}`, render: <span>Search for “{debounced}”</span> });
    for (const h of ta.data?.hashtags ?? []) options.push({ key: `h${h.tag}`, href: `/search?q=${encodeURIComponent("#" + h.tag)}`, render: <span className="flex items-center gap-3"><Hash size={18} className="text-fg2" />#{h.tag} <span className="text-sm text-fg2">{h.count} posts</span></span> });
    for (const t of ta.data?.topics ?? []) options.push({ key: `t${t.slug}`, href: `/i/topics/${t.slug}`, render: <span className="flex items-center gap-3"><MessageSquareText size={18} className="text-fg2" />{t.name} <span className="text-sm text-fg2">Topic</span></span> });
    for (const u of ta.data?.users ?? [])
      options.push({
        key: `u${u.id}`,
        href: `/${u.handle}`,
        render: (
          <span className="flex items-center gap-3">
            <Avatar user={u} size={40} />
            <span className="min-w-0">
              <DisplayName user={u} />
              <span className="block truncate text-fg2">@{u.handle}</span>
            </span>
          </span>
        ),
      });
  }

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const submit = () => {
    const q = value.trim();
    if (!q) return;
    if (active >= 0 && options[active]) return go(options[active].href);
    go(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <div
      ref={wrap}
      className="relative"
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={clsx("flex h-[44px] items-center gap-3 rounded-full border px-4", open ? "border-accent-text bg-bg" : "border-transparent bg-input")}
      >
        <Search size={18} className={open ? "text-accent-text" : "text-fg2"} aria-hidden="true" />
        <input
          data-search-input
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => {
            setValue(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(options.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(-1, a - 1));
            } else if (e.key === "Escape") {
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="Search iSchoolie"
          aria-label="Search query"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg2"
          maxLength={500}
        />
        {value && (
          <button type="button" aria-label="Clear search" onClick={() => { setValue(""); setActive(-1); }} className="grid h-6 w-6 place-items-center rounded-full bg-accent text-accent-on">
            <X size={14} />
          </button>
        )}
      </form>
      {open && (
        <div id={listId} role="listbox" className="absolute inset-x-0 top-[48px] z-50 max-h-[min(70dvh,560px)] overflow-y-auto rounded-md bg-elevated" style={{ boxShadow: "var(--shadow)" }}>
          {!debounced && (
            <>
              {history.data && history.data.recent.length === 0 && history.data.saved.length === 0 && <p className="px-4 py-5 text-center text-fg2">Try searching for people, topics, or keywords</p>}
              {history.data && history.data.recent.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-heading font-extrabold">Recent</span>
                    <button
                      type="button"
                      className="text-sm text-accent-text hover:underline"
                      onClick={async () => {
                        await del("/search/history");
                        qc.invalidateQueries({ queryKey: ["search-history"] });
                      }}
                    >
                      Clear all
                    </button>
                  </div>
                  {history.data.recent.map((r) => (
                    <div key={r.id} className="flex items-center hover:bg-hover">
                      <Link href={`/search?q=${encodeURIComponent(r.query)}`} onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
                        <Clock size={18} className="text-fg2" /> <span className="truncate">{r.query}</span>
                      </Link>
                      <button
                        type="button"
                        aria-label={`Remove ${r.query} from recent searches`}
                        className="mr-2 grid h-8 w-8 place-items-center rounded-full text-accent-text hover:bg-accent-soft"
                        onClick={async () => {
                          await del(`/search/history/${r.id}`);
                          qc.invalidateQueries({ queryKey: ["search-history"] });
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {history.data && history.data.saved.length > 0 && (
                <div className="border-t border-line">
                  <div className="px-4 py-3 text-heading font-extrabold">Saved searches</div>
                  {history.data.saved.map((r) => (
                    <Link key={r.id} href={`/search?q=${encodeURIComponent(r.query)}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
                      <Bookmark size={18} className="text-fg2" /> <span className="truncate">{r.query}</span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
          {options.map((o, i) => (
            <button
              key={o.key}
              id={`${listId}-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => go(o.href)}
              className={clsx("block w-full px-4 py-3 text-left hover:bg-hover", i === active && "bg-hover-strong")}
            >
              {o.render}
            </button>
          ))}
          {debounced && ta.isError && <p className="px-4 py-3 text-fg2">Suggestions couldn’t load. Press Enter to search.</p>}
        </div>
      )}
    </div>
  );
}
