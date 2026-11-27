"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap, Plus, ArrowUp, ArrowDown, X, Camera, MoreHorizontal, Trash2, Pencil } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { Avatar, DisplayName, EmptyState, ErrorState, Menu, MenuItem, SectionHeading, TextField } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { get, post, patch, del, uploadFile, errorMessage, ApiError } from "@/lib/api";
import { MOMENT_DESC_MAX, MOMENT_TITLE_MAX, graphemeLength } from "@/lib/text";
import { relativeTime } from "@/lib/format";
import { PostCard, UnavailablePost } from "../posts/post-card";
import { seedPosts } from "../posts/cache";
import type { MediaDTO, MomentDTO, PostDTO, TimelinePage, UnavailableDTO } from "@/lib/types";

type MomentDetail = { moment: MomentDTO; items: ({ post: PostDTO } | { unavailable: UnavailableDTO })[]; posts: PostDTO[] };

function MomentCard({ m }: { m: MomentDTO }) {
  return (
    <Link href={m.publishedAt || !m.isOwner ? `/i/moments/${m.id}` : `/i/moments/${m.id}/edit`} className="flex gap-3 border-b border-line px-4 py-3 hover:bg-hover">
      <div className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-xl bg-subtle">
        {m.coverUrl ? <img src={m.coverUrl} alt="" className="h-full w-full object-cover" /> : <Zap size={26} className="text-fg2" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold break-anywhere">{m.title}</div>
        <div className="text-sm text-fg2">
          {m.publishedAt ? `Published ${relativeTime(m.publishedAt)}` : "Draft"} · {m.itemCount} post{m.itemCount === 1 ? "" : "s"}
        </div>
        <div className="mt-1 flex items-center gap-1 text-sm text-fg2">
          <Avatar user={m.owner} size={16} /> {m.owner.displayName}
        </div>
      </div>
    </Link>
  );
}

export function MomentsView() {
  const q = useQuery({ queryKey: ["moments"], queryFn: () => get<{ mine: MomentDTO[]; discover: MomentDTO[] }>("/moments") });
  return (
    <div>
      <PageHeader title="Stories" back right={<Link href="/i/moments/create" aria-label="Create new Story" title="Create new Story" className="grid h-[34px] w-[34px] place-items-center rounded-xl text-accent-text hover:bg-accent-soft"><Plus size={22} /></Link>} />
      {q.isPending && <Spinner className="py-8" />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data && (
        <>
          <SectionHeading>Your Stories</SectionHeading>
          {q.data.mine.length ? q.data.mine.map((m) => <MomentCard key={m.id} m={m} />) : (
            <EmptyState title="Create your first Story" body="Stories are curated collections of posts that tell a story." action={<Link href="/i/moments/create"><Button>Create new Story</Button></Link>} />
          )}
          {q.data.discover.length > 0 && (
            <>
              <SectionHeading>From people in this demo</SectionHeading>
              {q.data.discover.map((m) => <MomentCard key={m.id} m={m} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}

export function MomentView({ id }: { id: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({
    queryKey: ["moment", id],
    queryFn: async () => {
      const d = await get<MomentDetail>(`/moments/${id}`);
      seedPosts(qc, d.posts);
      return d;
    },
  });
  const remove = useMutation({
    mutationFn: () => del(`/moments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["moments"] });
      toast({ text: "Story deleted" });
      router.push("/i/moments");
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  if (q.isPending) return <div><PageHeader title="Story" back /><Spinner className="py-8" /></div>;
  if (q.isError) return <div><PageHeader title="Story" back />{q.error instanceof ApiError && q.error.status === 404 ? <EmptyState title="This Story isn’t available" body="It may be an unpublished draft or deleted." /> : <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}</div>;
  const { moment: m, items } = q.data;
  return (
    <div>
      <PageHeader
        title="Story"
        back
        right={
          m.isOwner ? (
            <Menu label="More" trigger={<button type="button" aria-label="More" className="grid h-[34px] w-[34px] place-items-center rounded-xl text-accent-text hover:bg-accent-soft"><MoreHorizontal size={20} /></button>}>
              <MenuItem icon={<Pencil />} href={`/i/moments/${m.id}/edit`}>Edit Story</MenuItem>
              <MenuItem icon={<Trash2 />} danger onSelect={() => setConfirm(true)}>Delete Story</MenuItem>
            </Menu>
          ) : undefined
        }
      />
      {m.coverUrl && (
        <div className="aspect-[2/1] max-h-[320px] w-full overflow-hidden bg-subtle">
          <img src={m.coverUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <header className="border-b border-line px-4 py-4">
        {!m.publishedAt && <p className="mb-1 text-sm font-bold text-accent-text">Draft — only you can see this</p>}
        <h1 className="text-display font-extrabold break-anywhere">{m.title}</h1>
        {m.description && <p className="mt-1 break-anywhere">{m.description}</p>}
        <Link href={`/${m.owner.handle}`} className="mt-2 flex items-center gap-2 text-fg2 hover:underline">
          <Avatar user={m.owner} size={20} />
          <DisplayName user={m.owner} className="text-fg" />
          {m.publishedAt && <span>· {relativeTime(m.publishedAt)}</span>}
        </Link>
      </header>
      {items.length === 0 && <EmptyState title="This Story is empty" />}
      {items.map((it, i) => ("post" in it ? <PostCard key={it.post.id} postId={it.post.id} /> : <div key={`u${i}`} className="border-b border-line py-1"><UnavailablePost reason={it.unavailable.unavailable} /></div>))}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete Story?" body="This can’t be undone." confirmLabel="Delete" danger busy={remove.isPending} onConfirm={() => remove.mutate()} />
    </div>
  );
}

/** Create/edit: title, description, cover, add posts (from your likes or a post link), reorder, publish. */
export function MomentEditor({ id }: { id?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const existing = useQuery({ queryKey: ["moment", id], queryFn: () => get<MomentDetail>(`/moments/${id}`), enabled: !!id });
  const [form, setForm] = useState<{ title: string; description: string; coverMediaId: string | null; coverUrl: string | null; posts: PostDTO[] } | null>(id ? null : { title: "", description: "", coverMediaId: null, coverUrl: null, posts: [] });
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"likes" | "mine" | "link">("likes");
  const [link, setLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  if (id && existing.data && !form) {
    const d = existing.data;
    setForm({ title: d.moment.title, description: d.moment.description, coverMediaId: d.moment.coverMediaId, coverUrl: d.moment.coverUrl, posts: d.posts });
  }
  const me = useQuery({ queryKey: ["session"], queryFn: () => get<{ actor: { handle: string } }>("/session") });
  const pool = useQuery({
    queryKey: ["moment-source", source, me.data?.actor.handle],
    queryFn: () => get<TimelinePage>(`/users/${me.data!.actor.handle}/timeline?tab=${source === "likes" ? "likes" : "posts"}`),
    enabled: !!me.data && source !== "link",
  });
  const save = useMutation({
    mutationFn: async (publish: boolean | null) => {
      const body = { title: form!.title, description: form!.description, coverMediaId: form!.coverMediaId, postIds: form!.posts.map((p) => p.id) };
      const d = id ? await patch<MomentDetail>(`/moments/${id}`, body) : await post<MomentDetail>("/moments", body);
      if (publish !== null) return post<MomentDetail>(`/moments/${d.moment.id}/publish`, { publish });
      return d;
    },
    onSuccess: (d, publish) => {
      qc.invalidateQueries({ queryKey: ["moments"] });
      qc.setQueryData(["moment", d.moment.id], d);
      toast({ text: publish ? "Story published" : publish === false ? "Story unpublished" : "Story saved" });
      router.push(publish || d.moment.publishedAt ? `/i/moments/${d.moment.id}` : `/i/moments/${d.moment.id}/edit`);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  if (id && existing.isError) return <div><PageHeader title="Edit Story" back /><ErrorState message={errorMessage(existing.error)} /></div>;
  if (!form) return <div><PageHeader title="Edit Story" back /><Spinner className="py-8" /></div>;
  if (id && existing.data && !existing.data.moment.isOwner) return <div><PageHeader title="Edit Story" back /><EmptyState title="You can’t edit this Story" /></div>;
  const has = new Set(form.posts.map((p) => p.id));
  const add = (p: PostDTO) => {
    if (has.has(p.id)) return;
    if (p.author.isProtected) return setError("Posts from protected accounts can’t be added to Stories.");
    setForm({ ...form, posts: [...form.posts, p] });
  };
  const move = (i: number, d: number) => {
    const next = [...form.posts];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    setForm({ ...form, posts: next });
  };
  const valid = graphemeLength(form.title.trim()) >= 1 && graphemeLength(form.title) <= MOMENT_TITLE_MAX && graphemeLength(form.description) <= MOMENT_DESC_MAX && !uploading;
  const published = !!existing.data?.moment.publishedAt;
  return (
    <div>
      <PageHeader
        title={id ? "Edit Story" : "Create new Story"}
        back
        right={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={!valid || save.isPending} onClick={() => save.mutate(null)}>Save</Button>
            <Button size="sm" disabled={!valid || save.isPending || form.posts.length === 0} onClick={() => save.mutate(!published ? true : null)} title={form.posts.length === 0 ? "Add at least one post to publish" : undefined}>
              {published ? "Update" : "Publish"}
            </Button>
          </div>
        }
      />
      <div className="relative aspect-[2/1] max-h-[260px] w-full overflow-hidden bg-line-strong">
        {form.coverUrl && <img src={form.coverUrl} alt="" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/30">
          <button type="button" aria-label="Set cover image" onClick={() => file.current?.click()} className="grid h-11 w-11 place-items-center rounded-xl bg-black/60 text-white">{uploading ? <Spinner size={20} /> : <Camera size={20} />}</button>
          {form.coverMediaId && <button type="button" aria-label="Remove cover image" onClick={() => setForm({ ...form, coverMediaId: null, coverUrl: null })} className="grid h-11 w-11 place-items-center rounded-xl bg-black/60 text-white"><X size={20} /></button>}
        </div>
        <input
          ref={file}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setUploading(true);
            try {
              const m = await uploadFile<MediaDTO>(f, { scope: "MOMENT" }, () => {}).promise;
              setForm((prev) => (prev ? { ...prev, coverMediaId: m.id, coverUrl: m.url } : prev));
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setUploading(false);
            }
          }}
        />
      </div>
      <TextField label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} max={MOMENT_TITLE_MAX} />
      <TextField label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} max={MOMENT_DESC_MAX} multiline />
      {error && <p className="px-4 text-danger" role="alert">{error}</p>}
      <SectionHeading>Posts in this Moment ({form.posts.length})</SectionHeading>
      {form.posts.length === 0 && <p className="px-4 pb-3 text-fg2">Add posts from the list below. You can reorder them before publishing.</p>}
      <ol>
        {form.posts.map((p, i) => (
          <li key={p.id} className="flex items-start gap-2 border-b border-line px-4 py-2">
            <span className="w-6 pt-1 text-sm font-bold text-fg2">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-sm"><DisplayName user={p.author} /> <span className="text-fg2">@{p.author.handle}</span></div>
              <p className="line-clamp-2 text-sm break-anywhere">{p.text || "(Media)"}</p>
            </div>
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="grid h-8 w-8 place-items-center rounded-xl text-accent-text hover:bg-accent-soft disabled:opacity-30"><ArrowUp size={16} /></button>
            <button type="button" aria-label="Move down" disabled={i === form.posts.length - 1} onClick={() => move(i, 1)} className="grid h-8 w-8 place-items-center rounded-xl text-accent-text hover:bg-accent-soft disabled:opacity-30"><ArrowDown size={16} /></button>
            <button type="button" aria-label="Remove from Story" onClick={() => setForm({ ...form, posts: form.posts.filter((x) => x.id !== p.id) })} className="grid h-8 w-8 place-items-center rounded-xl text-danger hover:bg-like-soft"><X size={16} /></button>
          </li>
        ))}
      </ol>
      <SectionHeading>Add posts</SectionHeading>
      <div className="flex gap-2 px-4 pb-2">
        {(["likes", "mine", "link"] as const).map((s) => (
          <Button key={s} size="sm" variant={source === s ? "primary" : "neutral"} onClick={() => setSource(s)}>
            {s === "likes" ? "Your cheers" : s === "mine" ? "Your posts" : "By link"}
          </Button>
        ))}
      </div>
      {source === "link" ? (
        <form
          className="flex gap-2 px-4 pb-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const m = link.match(/status\/([A-Za-z0-9_-]+)/) ?? link.match(/^([A-Za-z0-9_-]{8,})$/);
            if (!m) return setError("Paste a post link like /handle/status/123.");
            try {
              const p = await get<PostDTO | UnavailableDTO>(`/posts/${m[1]}`);
              if ("unavailable" in p) return setError("That post isn’t available to add.");
              add(p);
              setLink("");
              setError(null);
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a post link" aria-label="Post link" className="h-10 min-w-0 flex-1 rounded-xl bg-input px-4 outline-none" />
          <Button type="submit" size="sm">Add</Button>
        </form>
      ) : (
        <>
          {pool.isPending && <Spinner className="py-4" />}
          {pool.data?.posts.filter((p) => !p.replyToId || source === "likes").map((p) => (
            <div key={p.id} className="flex items-start gap-3 border-b border-line px-4 py-2">
              <Avatar user={p.author} size={32} />
              <div className="min-w-0 flex-1">
                <div className="text-sm"><DisplayName user={p.author} /></div>
                <p className="line-clamp-2 text-sm break-anywhere">{p.text || "(Media)"}</p>
              </div>
              <Button size="sm" variant={has.has(p.id) ? "neutral" : "outline"} disabled={has.has(p.id) || p.author.isProtected} onClick={() => add(p)} title={p.author.isProtected ? "Protected posts can’t be added" : undefined}>
                {has.has(p.id) ? "Added" : <><Plus size={14} /> Add</>}
              </Button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
