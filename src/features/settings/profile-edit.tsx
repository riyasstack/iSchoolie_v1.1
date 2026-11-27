"use client";
/** Edit profile with avatar/header upload, crop (pan + zoom), preview, validation, save/cancel. */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, X } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { TextField, ErrorState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, ConfirmDialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/components/providers";
import { get, patch, uploadFile, errorMessage } from "@/lib/api";
import { BIO_MAX, LOCATION_MAX, NAME_MAX, WEBSITE_MAX, graphemeLength, safeHref } from "@/lib/text";
import type { MediaDTO, ProfileDTO } from "@/lib/types";

interface Form {
  displayName: string;
  bio: string;
  location: string;
  website: string;
  avatarMediaId: string | null;
  avatarUrl: string | null;
  bannerMediaId: string | null;
  bannerUrl: string | null;
}

export function ProfileEditor() {
  const s = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["profile", s.actor.handle.toLowerCase()], queryFn: () => get<ProfileDTO>(`/users/${s.actor.handle}`) });
  const [form, setForm] = useState<Form | null>(null);
  const [initial, setInitial] = useState<string>("");
  const [crop, setCrop] = useState<{ file: File; kind: "avatar" | "banner" } | null>(null);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (q.data && !form) {
      const f = { displayName: q.data.displayName, bio: q.data.bio, location: q.data.location, website: q.data.website, avatarMediaId: q.data.avatarMediaId, avatarUrl: q.data.avatarUrl, bannerMediaId: q.data.bannerMediaId, bannerUrl: q.data.bannerUrl };
      setForm(f);
      setInitial(JSON.stringify(f));
    }
  }, [q.data, form]);
  const save = useMutation({
    mutationFn: () => patch<ProfileDTO>("/me/profile", { displayName: form!.displayName, bio: form!.bio, location: form!.location, website: form!.website, avatarMediaId: form!.avatarMediaId, bannerMediaId: form!.bannerMediaId }),
    onSuccess: (p) => {
      qc.setQueryData(["profile", p.handle.toLowerCase()], p);
      qc.invalidateQueries({ queryKey: ["session"] });
      qc.invalidateQueries({ queryKey: ["post"] });
      qc.invalidateQueries({ queryKey: ["timeline"] });
      toast({ text: "Your profile was saved" });
      router.push(`/${p.handle}`);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  if (q.isError) return <div><PageHeader title="Edit profile" back /><ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /></div>;
  if (!form) return <div><PageHeader title="Edit profile" back /><Spinner className="py-8" /></div>;
  const dirty = JSON.stringify(form) !== initial;
  const errs = {
    displayName: graphemeLength(form.displayName.trim()) < 1 ? "Name can’t be blank." : graphemeLength(form.displayName) > NAME_MAX ? `Name must be ${NAME_MAX} characters or fewer.` : null,
    bio: graphemeLength(form.bio) > BIO_MAX ? `Bio must be ${BIO_MAX} characters or fewer.` : null,
    location: graphemeLength(form.location) > LOCATION_MAX ? `Location must be ${LOCATION_MAX} characters or fewer.` : null,
    website: form.website.trim() && !safeHref(form.website.trim()) ? "Enter a valid http(s) website address." : form.website.length > WEBSITE_MAX ? "Website is too long." : null,
  };
  const valid = !Object.values(errs).some(Boolean) && !uploading;
  const cancel = () => (dirty ? setConfirmLeave(true) : router.back());
  const onPick = (kind: "avatar" | "banner") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setError("Use a JPEG, PNG or WebP image.");
    if (f.size > 5 * 1024 * 1024) return setError("Images must be 5 MB or smaller.");
    setError(null);
    setCrop({ file: f, kind });
  };
  return (
    <div>
      <PageHeader title="Edit profile" back right={<Button size="sm" variant="inverse" disabled={!valid || !dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save"}</Button>} />
      <div className="relative aspect-[3/1] w-full overflow-hidden bg-line-strong">
        {form.bannerUrl && <img src={form.bannerUrl} alt="Header preview" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/30">
          <button type="button" aria-label="Add header photo" onClick={() => bannerInput.current?.click()} className="grid h-11 w-11 place-items-center rounded-xl bg-black/60 text-white hover:bg-black/40">
            {uploading === "banner" ? <Spinner size={20} /> : <Camera size={20} />}
          </button>
          {form.bannerMediaId && (
            <button type="button" aria-label="Remove header photo" onClick={() => setForm({ ...form, bannerMediaId: null, bannerUrl: null })} className="grid h-11 w-11 place-items-center rounded-xl bg-black/60 text-white hover:bg-black/40">
              <X size={20} />
            </button>
          )}
        </div>
        <input ref={bannerInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={onPick("banner")} />
      </div>
      <div className="px-4">
        <div className="relative -mt-[12%] h-[112px] w-[112px] max-w-[25vw] max-h-[25vw] overflow-hidden rounded-xl border-4 border-bg bg-subtle">
          {form.avatarUrl && <img src={form.avatarUrl} alt="Profile photo preview" className="h-full w-full object-cover" />}
          <button type="button" aria-label="Change profile photo" onClick={() => avatarInput.current?.click()} className="absolute inset-0 grid place-items-center bg-black/30 text-white hover:bg-black/20">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-black/60">{uploading === "avatar" ? <Spinner size={20} /> : <Camera size={20} />}</span>
          </button>
          <input ref={avatarInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={onPick("avatar")} />
        </div>
      </div>
      {error && <p className="px-4 pt-2 text-danger" role="alert">{error}</p>}
      <TextField label="Name" value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} max={NAME_MAX} error={errs.displayName} />
      <TextField label="Bio" value={form.bio} onChange={(v) => setForm({ ...form, bio: v })} max={BIO_MAX} multiline error={errs.bio} />
      <TextField label="Location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} max={LOCATION_MAX} error={errs.location} />
      <TextField label="Website" value={form.website} onChange={(v) => setForm({ ...form, website: v })} countMode="none" error={errs.website} inputMode="url" />
      <div className="flex justify-end gap-2 px-4 pb-6">
        <Button variant="neutral" onClick={cancel}>Cancel</Button>
        <Button disabled={!valid || !dirty || save.isPending} onClick={() => save.mutate()}>Save</Button>
      </div>
      {crop && (
        <CropDialog
          file={crop.file}
          aspect={crop.kind === "avatar" ? 1 : 3}
          round={crop.kind === "avatar"}
          onClose={() => setCrop(null)}
          onApply={async (blob) => {
            const kind = crop.kind;
            setCrop(null);
            setUploading(kind);
            try {
              const m = await uploadFile<MediaDTO>(new File([blob], `${kind}.jpg`, { type: "image/jpeg" }), { scope: "PROFILE" }, () => {}).promise;
              setForm((f) => (f ? (kind === "avatar" ? { ...f, avatarMediaId: m.id, avatarUrl: m.url } : { ...f, bannerMediaId: m.id, bannerUrl: m.url }) : f));
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setUploading(null);
            }
          }}
        />
      )}
      <ConfirmDialog open={confirmLeave} onOpenChange={setConfirmLeave} title="Discard changes?" body="This can’t be undone and you’ll lose your changes." confirmLabel="Discard" danger onConfirm={() => router.back()} />
    </div>
  );
}

function CropDialog({ file, aspect, round, onClose, onApply }: { file: File; aspect: number; round: boolean; onClose: () => void; onApply: (b: Blob) => void }) {
  // The object URL is created and revoked by the same effect, so React Strict Mode's
  // mount → cleanup → mount cycle can't leave the <img> pointing at a revoked URL.
  const [url, setUrl] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    setImg(null);
    setFailed(false);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const W = 400;
  const H = W / aspect;
  // Base scale covers the frame.
  const base = img ? Math.max(W / img.naturalWidth, H / img.naturalHeight) : 1;
  const scale = base * zoom;
  const clamp = (o: { x: number; y: number }) => {
    if (!img) return o;
    const maxX = Math.max(0, (img.naturalWidth * scale - W) / 2);
    const maxY = Math.max(0, (img.naturalHeight * scale - H) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, o.x)), y: Math.max(-maxY, Math.min(maxY, o.y)) };
  };
  const apply = () => {
    if (!img) return;
    const outW = round ? 800 : 1500;
    const outH = outW / aspect;
    const c = document.createElement("canvas");
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext("2d")!;
    const k = outW / W;
    const dw = img.naturalWidth * scale * k;
    const dh = img.naturalHeight * scale * k;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, (outW - dw) / 2 + offset.x * k, (outH - dh) / 2 + offset.y * k, dw, dh);
    c.toBlob((b) => b && onApply(b), "image/jpeg", 0.9);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Edit media" back={onClose} headerAction={<Button size="sm" className="mr-2" disabled={!img} onClick={apply}>Apply</Button>} fullScreenMobile>
      <DialogBody>
        <div
          ref={frame}
          className="relative mx-auto touch-none overflow-hidden bg-black"
          style={{ width: "100%", maxWidth: W, aspectRatio: String(aspect), containerType: "inline-size" }}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const ratio = W / (frame.current?.clientWidth || W);
            setOffset(clamp({ x: drag.current.ox + (e.clientX - drag.current.x) * ratio, y: drag.current.oy + (e.clientY - drag.current.y) * ratio }));
          }}
          onPointerUp={() => (drag.current = null)}
          onKeyDown={(e) => {
            const step = 10;
            if (e.key === "ArrowLeft") setOffset((o) => clamp({ ...o, x: o.x - step }));
            if (e.key === "ArrowRight") setOffset((o) => clamp({ ...o, x: o.x + step }));
            if (e.key === "ArrowUp") setOffset((o) => clamp({ ...o, y: o.y - step }));
            if (e.key === "ArrowDown") setOffset((o) => clamp({ ...o, y: o.y + step }));
          }}
          tabIndex={0}
          aria-label="Crop area. Drag or use arrow keys to reposition."
        >
          {url && (
          <img
            key={url}
            src={url}
            alt=""
            onLoad={(e) => setImg(e.currentTarget)}
            onError={() => setFailed(true)}
            draggable={false}
            className="absolute left-1/2 top-1/2 max-w-none select-none"
            style={img ? { width: `${((img.naturalWidth * scale) / W) * 100}%`, transform: `translate(calc(-50% + ${(offset.x / W) * 100}cqw), calc(-50% + ${(offset.y / W) * 100}cqw))` } : { visibility: "hidden" }}
          />
          )}
          {failed && (
            <p role="alert" className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-white">
              This image couldn’t be opened. Try a different JPEG, PNG or WebP file.
            </p>
          )}
          {round && <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />}
        </div>
        <label className="mt-4 flex items-center gap-3">
          <span className="text-sm text-fg2">Zoom</span>
          <input type="range" className="legacy-range flex-1" min={1} max={3} step={0.01} value={zoom} onChange={(e) => { setZoom(Number(e.target.value)); setOffset((o) => clamp(o)); }} aria-label="Zoom" />
        </label>
      </DialogBody>
    </Dialog>
  );
}
