"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Play } from "lucide-react";
import { usePreferences } from "@/components/providers";
import type { MediaDTO } from "@/lib/types";

/** Legacy media grid: 1–4 photos in a 16:9 frame, or a single GIF/video. */
export function MediaGrid({ media, href, sensitive }: { media: MediaDTO[]; href: (index: number) => string; sensitive?: boolean }) {
  const prefs = usePreferences();
  const [revealed, setRevealed] = useState(!sensitive || prefs.showSensitiveMedia);
  if (!media.length) return null;
  const first = media[0];
  if (!revealed) {
    return (
      <div className="mt-3 grid aspect-video place-items-center rounded-card border border-line bg-subtle p-6 text-center">
        <div>
          <p className="font-bold">The following media includes potentially sensitive content.</p>
          <button type="button" className="mt-3 rounded-full border border-line-strong px-4 py-1.5 font-bold hover:bg-hover-strong" onClick={(e) => { e.stopPropagation(); setRevealed(true); }}>
            View
          </button>
        </div>
      </div>
    );
  }
  if (first.kind === "VIDEO") return <div className="mt-3"><VideoPlayer media={first} /></div>;
  if (first.kind === "GIF") return <div className="mt-3"><GifPlayer media={first} href={href(1)} /></div>;
  const n = media.length;
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
        <Link
          key={m.id}
          href={href(i + 1)}
          scroll={false}
          onClick={(e) => e.stopPropagation()}
          className={clsx("relative block h-full w-full overflow-hidden bg-subtle", n === 3 && i === 0 && "row-span-2")}
          aria-label={m.alt ? `Image: ${m.alt}` : `Image ${i + 1} of ${n}`}
        >
          <Img media={m} />
          {m.alt && (
            <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1 text-[0.8125rem] font-bold text-white" aria-hidden="true">
              ALT
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

function Img({ media }: { media: MediaDTO }) {
  const prefs = usePreferences();
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className="grid h-full w-full place-items-center p-4 text-center text-sm text-fg2" role="img" aria-label={media.alt || "Image unavailable"}>
        Image unavailable
      </span>
    );
   
  return <img src={prefs.dataSaver && media.thumbUrl ? media.thumbUrl : media.thumbUrl ?? media.url} alt={media.alt} className="h-full w-full object-cover" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
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
          <span className="grid h-14 w-14 place-items-center rounded-full border-4 border-white bg-accent text-white">
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
