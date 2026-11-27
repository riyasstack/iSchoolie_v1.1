"use client";
/** Shareable media viewer (/:handle/status/:id/photo/:n): fit-to-screen, arrows/keys, ALT, video controls. */
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog as R } from "radix-ui";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import clsx from "clsx";
import { isPost, usePost } from "./cache";
import { PostActions, postPath, UnavailablePost } from "./post-card";
import { VideoPlayer } from "./post-media";
import { Spinner } from "@/components/ui/spinner";
import { RichText } from "./rich-text";
import { Avatar, DisplayName } from "@/components/ui/misc";

export function MediaViewer({ id, n, kind, asModal }: { id: string; n: number; kind: "photo" | "video"; asModal?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, isPending, isError } = usePost(id);
  const [showAlt, setShowAlt] = useState(false);
  const open = !asModal || /\/status\/[^/]+\/(photo|video)\/\d+$/.test(pathname);
  const p = isPost(data) ? data : null;
  const count = p?.media.length ?? 0;
  const index = Math.min(Math.max(1, n), Math.max(1, count)) - 1;
  const media = p?.media[index];
  const close = () => {
    if (asModal) router.back();
    else if (p) router.push(postPath(p));
    else router.push("/home");
  };
  const go = (d: number) => {
    if (!p) return;
    const next = index + d;
    if (next < 0 || next >= count) return;
    router.replace(`${postPath(p)}/${kind}/${next + 1}`, { scroll: false });
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!open) return null;
  return (
    <R.Root open onOpenChange={(o) => !o && close()}>
      <R.Portal>
        <R.Overlay className="fixed inset-0 z-[90] bg-[var(--media-overlay)]" />
        <R.Content aria-describedby={undefined} className="fixed inset-0 z-[90] flex flex-col outline-none">
          <R.Title className="sr-only">{media?.alt ? `Image: ${media.alt}` : "Media viewer"}</R.Title>
          <div className="flex items-center justify-between p-3">
            <R.Close aria-label="Close" className="grid h-10 w-10 place-items-center rounded-xl bg-black/40 text-white hover:bg-white/20">
              <X size={22} />
            </R.Close>
            {count > 1 && <span className="rounded-xl bg-black/40 px-3 py-1 text-sm text-white">{index + 1} / {count}</span>}
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2" onClick={(e) => e.target === e.currentTarget && close()}>
            {isPending && <Spinner />}
            {(isError || (data && !p)) && <div className="max-w-md"><UnavailablePost reason={data && !isPost(data) ? data.unavailable : "not_found"} /></div>}
            {p && !media && <p className="text-white">This media isn’t available.</p>}
            {media && (media.kind === "VIDEO" ? (
              <div className="w-full max-w-[min(1000px,100%)]"><VideoPlayer media={media} large /></div>
            ) : (
               
              <img src={media.url} alt={media.alt} className="max-h-full max-w-full select-none object-contain" draggable={false} />
            ))}
            {index > 0 && (
              <button type="button" aria-label="Previous image" onClick={() => go(-1)} className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl bg-black/50 text-white hover:bg-black/70">
                <ChevronLeft size={24} />
              </button>
            )}
            {index < count - 1 && (
              <button type="button" aria-label="Next image" onClick={() => go(1)} className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-xl bg-black/50 text-white hover:bg-black/70">
                <ChevronRight size={24} />
              </button>
            )}
            {media?.alt && (
              <button type="button" onClick={() => setShowAlt((s) => !s)} aria-expanded={showAlt} className="absolute bottom-3 left-3 rounded bg-black/70 px-2 py-0.5 text-sm font-bold text-white">
                ALT
              </button>
            )}
          </div>
          {showAlt && media?.alt && <p className="mx-auto max-w-[600px] px-4 pb-2 text-center text-white">{media.alt}</p>}
          {p && (
            <div className={clsx("mx-auto w-full max-w-[600px] px-4 pb-[env(safe-area-inset-bottom)] text-white [&_[role=group]]:mx-auto [&_[role=group]_button]:text-white/90")}>
              <div className="hidden items-start gap-2 pb-2 sm:flex">
                <Avatar user={p.author} size={24} />
                <DisplayName user={p.author} className="text-white" />
                {p.text && <RichText text={p.text} className="line-clamp-1 text-white/80" />}
              </div>
              <PostActions p={p} />
            </div>
          )}
        </R.Content>
      </R.Portal>
    </R.Root>
  );
}
