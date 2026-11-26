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
const EMOJI: { name: string; list: string[] }[] = [
  { name: "Smileys", list: "😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 🤔 🤨 😐 😑 😶 🙄 😏 😬 😌 😴 🤓 😎 🥳 😮 😲 😳 🥺 😢 😭 😤 😡 🤯 🥶 🤗 🤫 🤭".split(" ") },
  { name: "People", list: "👋 🤚 ✋ 👌 ✌️ 🤞 🤟 🤘 👍 👎 👏 🙌 🙏 💪 🧠 👀 🧑‍🎓 🧑‍🏫 🧑‍🔬 🧑‍💻 🧑‍🎨 🏃 🧘".split(" ") },
  { name: "Nature", list: "🌱 🌿 🍀 🌸 🌻 🌙 ⭐ 🌟 ☀️ ⛅ 🌧️ ❄️ 🌈 🔥 🌊 🐌 🐢 🦆 🐙 🦀".split(" ") },
  { name: "Objects", list: "📚 📖 ✏️ 📝 📐 🔬 🔭 🧪 🧮 💡 🎨 🏺 🎸 🎷 🥁 🎹 ⚽ 🏀 ♟️ 🤖 🚀 💻 ☕ 🍕".split(" ") },
  { name: "Symbols", list: "❤️ 🧡 💛 💚 💙 💜 🖤 💯 ✅ ❌ ⚠️ ❓ ❗ ✨ 🎉 🔔 ♻️ ➡️ ⬅️ 🔁".split(" ") },
];

export function EmojiPicker({ onPick, trigger }: { onPick: (e: string) => void; trigger: React.ReactNode }) {
  const [cat, setCat] = useState(0);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="bottom" align="start" sideOffset={6} collisionPadding={8} className="motion-fade z-[80] w-[300px] rounded-card bg-elevated p-2" style={{ boxShadow: "var(--shadow)" }} aria-label="Emoji picker">
          <div className="flex gap-1 border-b border-line pb-2" role="tablist" aria-label="Emoji categories">
            {EMOJI.map((c, i) => (
              <button key={c.name} type="button" role="tab" aria-selected={i === cat} onClick={() => setCat(i)} className={clsx("rounded-full px-2 py-1 text-xs font-bold", i === cat ? "bg-accent-soft text-accent-text" : "text-fg2 hover:bg-hover-strong")}>
                {c.name}
              </button>
            ))}
          </div>
          <div className="grid max-h-[220px] grid-cols-8 gap-0.5 overflow-y-auto pt-2" role="grid">
            {EMOJI[cat].list.map((e) => (
              <button key={e} type="button" aria-label={`Insert ${e}`} onClick={() => onPick(e)} className="grid h-8 w-8 place-items-center rounded-md text-xl hover:bg-accent-soft">
                {e}
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the bundled GIF collection" aria-label="Search GIFs" className="h-10 w-full rounded-full bg-input px-4 outline-none" />
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
