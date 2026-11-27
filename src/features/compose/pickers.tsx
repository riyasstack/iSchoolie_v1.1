"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Popover } from "radix-ui";
import clsx from "clsx";
import { Dialog, DialogBody } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/misc";
import { get, errorMessage } from "@/lib/api";
import { localTimeZone, zonedToUtc, utcToZoned, formatInZone } from "@/lib/format";

// ------------------------------------------------------------------- emoji
// Full Unicode emoji set from emojibase-data (MIT), loaded only when the picker opens.
interface Emoji {
  unicode: string;
  label: string;
  group: number;
  order: number;
  tags: string[];
}
const GROUPS: { id: number; name: string }[] = [
  { id: 0, name: "Smileys" },
  { id: 1, name: "People" },
  { id: 3, name: "Nature" },
  { id: 4, name: "Food" },
  { id: 5, name: "Travel" },
  { id: 6, name: "Activities" },
  { id: 7, name: "Objects" },
  { id: 8, name: "Symbols" },
  { id: 9, name: "Flags" },
];
let emojiCache: Promise<Emoji[]> | null = null;
function loadEmoji(): Promise<Emoji[]> {
  emojiCache ??= import("emojibase-data/en/compact.json").then((m) =>
    (m.default as { unicode: string; label: string; group?: number; order?: number; tags?: string[] }[])
      .filter((e) => typeof e.group === "number" && e.group !== 2)
      .map((e) => ({ unicode: e.unicode, label: e.label, group: e.group!, order: e.order ?? 0, tags: e.tags ?? [] }))
      .sort((a, b) => a.order - b.order),
  );
  return emojiCache;
}
const RECENT_KEY = "isc-recent-emoji";
function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
function pushRecent(e: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...readRecent().filter((x) => x !== e)].slice(0, 24)));
  } catch {
    /* storage unavailable: recents are a convenience only */
  }
}

export function EmojiPicker({ onPick, trigger }: { onPick: (e: string) => void; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="start" sideOffset={6} collisionPadding={8} className="motion-fade z-[80] w-[320px] max-w-[calc(100vw-16px)] rounded-card bg-elevated p-2" style={{ boxShadow: "var(--shadow)" }} aria-label="Emoji picker">
          {open && (
            <EmojiPanel
              onPick={(e) => {
                pushRecent(e);
                onPick(e);
              }}
            />
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function EmojiPanel({ onPick }: { onPick: (e: string) => void }) {
  const data = useQuery({ queryKey: ["emoji-data"], queryFn: loadEmoji, staleTime: Infinity, gcTime: Infinity });
  const [q, setQ] = useState("");
  const [recent] = useState(readRecent);
  const [group, setGroup] = useState<number | "recent">(recent.length ? "recent" : 0);
  const query = q.trim().toLowerCase();
  const list: { unicode: string; label: string }[] = !data.data
    ? []
    : query
      ? data.data.filter((e) => e.label.toLowerCase().includes(query) || e.tags.some((t) => t.startsWith(query))).slice(0, 160)
      : group === "recent"
        ? recent.map((u) => data.data.find((e) => e.unicode === u) ?? { unicode: u, label: u })
        : data.data.filter((e) => e.group === group);
  return (
    <div>
      <label className="sr-only" htmlFor="emoji-search">Search emoji</label>
      <input id="emoji-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search emoji" autoFocus className="mb-2 h-9 w-full rounded-xl bg-input px-3 outline-none" />
      {!query && (
        <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line pb-2" role="tablist" aria-label="Emoji categories">
          {[...(recent.length ? [{ id: "recent" as const, name: "Recent" }] : []), ...GROUPS].map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={c.id === group} onClick={() => setGroup(c.id)} className={clsx("shrink-0 rounded-xl px-2 py-1 text-xs font-semibold", c.id === group ? "bg-accent-soft text-accent-text" : "text-fg2 hover:bg-hover-strong")}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {data.isPending && <Spinner className="py-6" />}
      {data.isError && <ErrorState message="Emoji couldn’t load." onRetry={() => data.refetch()} />}
      <div className="grid max-h-[240px] grid-cols-8 gap-0.5 overflow-y-auto pt-2" role="grid" aria-label={query ? "Search results" : "Emoji"}>
        {list.map((e) => (
          <button key={e.unicode} type="button" title={e.label} aria-label={`Insert ${e.label}`} onClick={() => onPick(e.unicode)} className="grid h-9 w-9 place-items-center rounded-md text-xl hover:bg-accent-soft">
            {e.unicode}
          </button>
        ))}
        {data.data && !list.length && <p className="col-span-8 py-4 text-center text-sm text-fg2">{query ? `No emoji match “${q}”` : "Nothing here yet"}</p>}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------- gif
interface Gif {
  file: string;
  title: string;
  alt: string;
  previewUrl: string;
}

export function GifPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (file: string) => void }) {
  const [q, setQ] = useState("");
  const gifs = useQuery({ queryKey: ["gifs"], queryFn: () => get<Gif[]>("/gifs"), enabled: open, staleTime: Infinity });
  const list = (gifs.data ?? []).filter((g) => g.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Choose a GIF" fullScreenMobile>
      <div className="border-b border-line px-4 py-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the bundled GIF collection" aria-label="Search GIFs" className="h-10 w-full rounded-xl bg-input px-4 outline-none" />
        <p className="mt-2 text-xs text-fg2">This demo uses a small bundled collection of original animations. No external GIF service is connected.</p>
      </div>
      {gifs.isPending && <Spinner className="py-8" />}
      {gifs.isError && <ErrorState message={errorMessage(gifs.error)} onRetry={() => gifs.refetch()} />}
      <div className="grid grid-cols-2 gap-1 p-1">
        {list.map((g) => (
          <button key={g.file} type="button" onClick={() => onPick(g.file)} className="relative aspect-[4/3] overflow-hidden rounded-md bg-subtle hover:opacity-90" aria-label={`Choose GIF: ${g.title}`}>
            <img src={g.previewUrl} alt={g.alt} className="h-full w-full object-cover" />
            <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-xs font-bold text-white">{g.title}</span>
          </button>
        ))}
        {gifs.data && list.length === 0 && <p className="col-span-2 px-4 py-6 text-center text-fg2">No GIFs match “{q}”.</p>}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- schedule
export interface ScheduleValue {
  iso: string;
  timezone: string;
}

const COMMON_ZONES = ["UTC", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "America/Sao_Paulo", "Europe/London", "Europe/Paris", "Europe/Berlin", "Africa/Lagos", "Africa/Nairobi", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"];

export function SchedulePicker({ open, value, onClose, onConfirm, onClear }: { open: boolean; value: ScheduleValue | null; onClose: () => void; onConfirm: (v: ScheduleValue) => void; onClear: () => void }) {
  const local = localTimeZone();
  const [openedAt] = useState(() => Date.now());
  const initialTz = value?.timezone ?? local;
  const initial = value ? utcToZoned(value.iso, initialTz) : utcToZoned(new Date(openedAt + 60 * 60_000).toISOString(), initialTz);
  const [tz, setTz] = useState(initialTz);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const zones = Array.from(new Set([local, ...COMMON_ZONES]));
  let instant: Date | null = null;
  let error: string | null = null;
  try {
    instant = zonedToUtc(date, time, tz);
    if (Number.isNaN(instant.getTime())) throw new Error();
    if (instant.getTime() < openedAt + 60_000) error = "Choose a time at least 1 minute in the future.";
    else if (instant.getTime() > openedAt + 548 * 86400_000) error = "Posts can be scheduled up to 18 months ahead.";
  } catch {
    error = "Choose a valid date and time.";
    instant = null;
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Schedule"
      headerAction={
        <Button size="sm" className="mr-2" disabled={!!error || !instant} onClick={() => instant && onConfirm({ iso: instant.toISOString(), timezone: tz })}>
          {value ? "Update" : "Confirm"}
        </Button>
      }
    >
      <DialogBody>
        {instant && !error && (
          <p className="mb-4 flex items-center gap-2 text-fg2">
            Will send on {formatInZone(instant.toISOString(), tz)}
            {tz !== local && <span className="text-xs">({formatInZone(instant.toISOString(), local)} your time)</span>}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block rounded border border-line-strong px-2 pt-1 focus-within:border-accent-text">
            <span className="text-xs text-fg2">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-transparent pb-2 outline-none" />
          </label>
          <label className="block rounded border border-line-strong px-2 pt-1 focus-within:border-accent-text">
            <span className="text-xs text-fg2">Time</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full bg-transparent pb-2 outline-none" />
          </label>
        </div>
        <label className="mt-4 block rounded border border-line-strong px-2 pt-1 focus-within:border-accent-text">
          <span className="text-xs text-fg2">Time zone</span>
          <select value={tz} onChange={(e) => setTz(e.target.value)} className="w-full bg-transparent pb-2 outline-none">
            {zones.map((z) => (
              <option key={z} value={z} className="bg-bg">
                {z}
                {z === local ? " (your device)" : ""}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="mt-3 text-danger" role="alert">{error}</p>}
        <p className="mt-4 text-sm text-fg2">Scheduled posts are published by the iSchoolie server at the chosen time, even if you close this tab.</p>
        <div className="mt-4 flex items-center justify-between">
          <Link href="/compose/scheduled" className="text-accent-text hover:underline">Scheduled posts</Link>
          {value && (
            <Button variant="danger-outline" size="sm" onClick={onClear}>
              Clear
            </Button>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
}
