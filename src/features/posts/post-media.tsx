"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, PartyPopper, Play } from "lucide-react";
import { usePreferences } from "@/components/providers";
import type { MediaDTO } from "@/lib/types";

/**
 * Post media. Default: 1–4 photos in a rounded 16:9 grid, or a single GIF/video.
 * `bleed`: edge-to-edge inside the card; several photos become a swipeable gallery.
 * `onDoubleTap`: a double tap/click cheers (return true to play the burst); a single
 * tap still opens the viewer, just after the double-tap window.
 */
export function MediaGrid({
  media,
  href,
  sensitive,
  bleed,
  onDoubleTap,
}: {
  media: MediaDTO[];
  href: (index: number) => string;
  sensitive?: boolean;
  bleed?: boolean;
  onDoubleTap?: () => boolean;
}) {
  const prefs = usePreferences();
  const [revealed, setRevealed] = useState(!sensitive || prefs.showSensitiveMedia);
  const tap = useDoubleTap(onDoubleTap);
  if (!media.length) return null;
  const first = media[0];
  if (!revealed) {
    return (
      <div className={clsx("mt-3 grid aspect-video place-items-center bg-subtle p-6 text-center", !bleed && "rounded-card border border-line")}>
        <div>
          <p className="font-bold">The following media includes potentially sensitive content.</p>
          <button type="button" className="press mt-3 rounded-xl border border-line-strong px-4 py-1.5 font-semibold hover:bg-hover-strong" onClick={(e) => { e.stopPropagation(); setRevealed(true); }}>
            View
          </button>
        </div>
      </div>
    );
  }
  const flat = bleed ? "[&>div]:rounded-none [&>div]:border-0" : "";
  if (first.kind === "VIDEO") return <div className={clsx("mt-3", flat)}><VideoPlayer media={first} /></div>;
  if (first.kind === "GIF")
    return (
      <div className={clsx("relative mt-3", flat)} onClickCapture={onDoubleTap ? tap.capture : undefined}>
        <GifPlayer media={first} href={href(1)} />
        {tap.burst}
      </div>
    );
  const n = media.length;
  if (bleed) return <Gallery media={media} href={href} tap={tap} />;
  const single = n === 1;
  const ratio = single && first.width && first.height ? Math.max(0.56, Math.min(first.width / first.height, 2)) : 16 / 9;
  return (
    <div
      className={clsx("relative mt-3 overflow-hidden rounded-card border border-line", !single && "grid gap-0.5")}
      style={{
        aspectRatio: String(ratio),
        maxHeight: single ? 510 : undefined,
        gridTemplateColumns: n > 1 ? "1fr 1fr" : undefined,
        gridTemplateRows: n > 2 ? "1fr 1fr" : "1fr",
      }}
    >
      {media.map((m, i) => (
        <MediaLink key={m.id} m={m} i={i} n={n} href={href(i + 1)} tap={tap} className={clsx("relative block h-full w-full overflow-hidden bg-subtle", n === 3 && i === 0 && "row-span-2")} />
      ))}
      {tap.burst}
    </div>
  );
}

type Tap = ReturnType<typeof useDoubleTap>;

/** Single tap opens `href` after a short window; a second tap inside it cheers instead. */
function useDoubleTap(onDoubleTap?: () => boolean) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bursts, setBursts] = useState<number[]>([]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const fire = () => {
    if (onDoubleTap?.()) setBursts((b) => [...b, Date.now()]);
  };
  const open = (e: MouseEvent<HTMLElement>, href: string) => {
    e.stopPropagation();
    // Keyboard activation (detail 0) and new-tab clicks keep normal link behaviour.
    if (!onDoubleTap || e.detail === 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      fire();
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      router.push(href, { scroll: false });
    }, 260);
  };
  /** For media without its own link (GIFs): cheer on double click, leave single clicks alone. */
  const capture = (e: MouseEvent<HTMLElement>) => {
    if (e.detail === 2) {
      e.stopPropagation();
      e.preventDefault();
      fire();
    }
  };
  const burst = bursts.length ? (
    <span className="pointer-events-none absolute inset-0 z-10 grid place-items-center" aria-hidden="true">
      {bursts.map((k) => (
        <CheerBurst key={k} onDone={() => setBursts((b) => b.filter((x) => x !== k))} />
      ))}
    </span>
  ) : null;
  return { open, capture, burst };
}

const CONFETTI = ["#0071e3", "#5856d6", "#e8590c", "#ff9f0a", "#34c759", "#ff375f", "#0a84ff", "#af52de"];

/** The double-tap celebration: a popping party popper inside a ring of confetti. */
export function CheerBurst({ onDone, size = 96 }: { onDone?: () => void; size?: number }) {
  return (
    <span
      data-cheer-burst=""
      className="cheer-burst relative col-start-1 row-start-1 grid place-items-center"
      onAnimationEnd={(e) => e.target === e.currentTarget && onDone?.()}
    >
      <span className="grid place-items-center rounded-full bg-white/90 text-like shadow-[0_10px_40px_rgba(0,0,0,0.25)] backdrop-blur" style={{ width: size, height: size }}>
        <PartyPopper size={size * 0.5} strokeWidth={2} />
      </span>
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          className="cheer-confetti absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-[3px]"
          style={{ background: c, ["--a" as string]: `${i * 45 + 20}deg`, ["--d" as string]: `${Math.round(size * 0.9)}px` }}
        />
      ))}
    </span>
  );
}

function MediaLink({ m, i, n, href, tap, className, eager }: { m: MediaDTO; i: number; n: number; href: string; tap: Tap; className: string; eager?: boolean }) {
  return (
    <Link href={href} scroll={false} onClick={(e) => tap.open(e, href)} className={className} aria-label={m.alt ? `Image: ${m.alt}` : `Image ${i + 1} of ${n}`} draggable={false}>
      <Img media={m} eager={eager} />
      {m.alt && (
        <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1 text-[0.8125rem] font-bold text-white" aria-hidden="true">
          ALT
        </span>
      )}
    </Link>
  );
}

/** Edge-to-edge photo gallery: scroll-snap swiping, dots, a counter and desktop arrows. */
function Gallery({ media, href, tap }: { media: MediaDTO[]; href: (index: number) => string; tap: Tap }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const n = media.length;
  const first = media[0];
  const ratio = first.width && first.height ? Math.max(0.8, Math.min(first.width / first.height, 1.91)) : n > 1 ? 1 : 4 / 3;
  const go = (d: number) => {
    const el = ref.current;
    if (el) el.scrollTo({ left: (index + d) * el.clientWidth, behavior: "smooth" });
  };
  const arrow = "press absolute top-1/2 hidden h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-black opacity-0 shadow backdrop-blur transition-opacity group-hover/gallery:opacity-100 focus-visible:opacity-100 sm:grid";
  return (
    <div className="group/gallery relative mt-3 overflow-hidden bg-subtle" style={{ aspectRatio: String(ratio), maxHeight: 640 }}>
      <div
        ref={ref}
        className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        role={n > 1 ? "group" : undefined}
        aria-roledescription={n > 1 ? "carousel" : undefined}
        aria-label={n > 1 ? `${n} photos` : undefined}
      >
        {media.map((m, i) => (
          <MediaLink key={m.id} m={m} i={i} n={n} href={href(i + 1)} tap={tap} eager={i === 0} className="relative block h-full w-full shrink-0 snap-center snap-always overflow-hidden" />
        ))}
      </div>
      {n > 1 && (
        <>
          <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-white backdrop-blur" aria-hidden="true">
            {index + 1}/{n}
          </span>
          <span className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden="true">
            {media.map((m, i) => (
              <span key={m.id} className={clsx("h-1.5 rounded-full bg-white shadow transition-all duration-200", i === index ? "w-4 opacity-100" : "w-1.5 opacity-60")} />
            ))}
          </span>
          {index > 0 && (
            <button type="button" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); go(-1); }} className={clsx(arrow, "left-3")}>
              <ChevronLeft size={18} />
            </button>
          )}
          {index < n - 1 && (
            <button type="button" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); go(1); }} className={clsx(arrow, "right-3")}>
              <ChevronRight size={18} />
            </button>
          )}
        </>
      )}
      {tap.burst}
    </div>
  );
}

function Img({ media, eager }: { media: MediaDTO; eager?: boolean }) {
  const prefs = usePreferences();
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className="grid h-full w-full place-items-center p-4 text-center text-sm text-fg2" role="img" aria-label={media.alt || "Image unavailable"}>
        Image unavailable
      </span>
    );
   
  return <img src={prefs.dataSaver && media.thumbUrl ? media.thumbUrl : media.thumbUrl ?? media.url} alt={media.alt} className="img-fade h-full w-full select-none object-cover" draggable={false} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} />;
}

export function GifPlayer({ media, href }: { media: MediaDTO; href?: string }) {
  const prefs = usePreferences();
  const auto = prefs.autoplay && !prefs.dataSaver && !prefs.reducedMotion;
  const [playing, setPlaying] = useState(auto);
  const ratio = media.width && media.height ? media.width / media.height : 4 / 3;
  const still = media.thumbUrl;
  return (
    <div className="relative overflow-hidden rounded-card border border-line bg-subtle" style={{ aspectRatio: String(ratio), maxHeight: 510 }}>
      {playing || !still ? (
         
        <img src={media.url} alt={media.alt} className="h-full w-full object-cover" loading="lazy" />
      ) : (
         
        <img src={still} alt={media.alt} className="h-full w-full object-cover" loading="lazy" />
      )}
      {!playing && (
        <button
          type="button"
          aria-label="Play GIF"
          className="absolute inset-0 grid place-items-center"
          onClick={(e) => {
            e.stopPropagation();
            setPlaying(true);
          }}
        >
          <span className="grid h-14 w-14 place-items-center rounded-xl border-4 border-white bg-accent text-white">
            <Play size={24} fill="currentColor" />
          </span>
        </button>
      )}
      {playing && still && (
        <button type="button" className="absolute inset-0" aria-label="Pause GIF" onClick={(e) => { e.stopPropagation(); setPlaying(false); }} />
      )}
      <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-1 text-[0.8125rem] font-bold text-white">GIF</span>
      {href && <Link href={href} scroll={false} className="sr-only" onClick={(e) => e.stopPropagation()}>Open GIF</Link>}
    </div>
  );
}

/** Real <video> with native controls. Autoplays muted only when allowed by preferences. */
export function VideoPlayer({ media, large }: { media: MediaDTO; large?: boolean }) {
  const prefs = usePreferences();
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  const allowAuto = prefs.autoplay && !prefs.dataSaver && !prefs.reducedMotion;
  useEffect(() => {
    const v = ref.current;
    if (!v || !allowAuto) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && e.intersectionRatio > 0.5) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [allowAuto]);
  const ratio = media.width && media.height ? media.width / media.height : 16 / 9;
  if (media.status === "PENDING") return <div className="grid aspect-video place-items-center rounded-card border border-line bg-subtle text-fg2">This video is processing.</div>;
  if (media.status === "FAILED" || error)
    return (
      <div className="grid aspect-video place-items-center rounded-card border border-line bg-subtle p-4 text-center text-fg2" role="alert">
        This video can’t be played{error ? " in your browser" : ""}.
      </div>
    );
  return (
    <div className="overflow-hidden rounded-card border border-line bg-black" onClick={(e) => e.stopPropagation()}>
      <video
        ref={ref}
        src={media.url}
        poster={media.thumbUrl ?? undefined}
        controls
        muted={allowAuto}
        playsInline
        loop={allowAuto}
        preload={prefs.dataSaver ? "none" : "metadata"}
        aria-label={media.alt || "Video"}
        onError={() => setError(true)}
        className="block w-full"
        style={{ aspectRatio: String(ratio), maxHeight: large ? "80dvh" : 510 }}
      />
    </div>
  );
}
