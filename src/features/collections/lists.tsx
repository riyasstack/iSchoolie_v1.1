"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Pin, PinOff, ScrollText, MoreHorizontal, Trash2, Flag, Pencil, Plus, Camera, X } from "lucide-react";
import { PageHeader } from "@/components/layout/app-shell";
import { Avatar, DisplayName, EmptyState, ErrorState, Menu, MenuItem, RouteTabs, SectionHeading, TextField, Checkbox } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Spinner, UserSkeleton } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { get, post, put, patch, del, uploadFile, errorMessage, ApiError } from "@/lib/api";
import { LIST_DESC_MAX, LIST_NAME_MAX, graphemeLength } from "@/lib/text";
import { Timeline } from "../timeline/timeline";
import { UserCell } from "../profiles/people";
import { useDialogs } from "../dialogs";
import type { ListDTO, MediaDTO, UserDTO, UserListItem } from "@/lib/types";

export function ListCard({ l }: { l: ListDTO }) {
  return (
    <Link href={`/i/lists/${l.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-subtle text-fg2">
        {l.bannerUrl ? <img src={l.bannerUrl} alt="" className="h-full w-full object-cover" /> : <ScrollText size={22} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 font-bold">
          <span className="truncate">{l.name}</span>
          {l.isPrivate && <Lock size={14} aria-label="Private circle" />}
        </div>
        <div className="flex items-center gap-1 text-sm text-fg2">
          <Avatar user={l.owner} size={16} /> <span className="truncate">{l.owner.displayName}</span> <span>@{l.owner.handle}</span>
        </div>
        {l.description && <p className="truncate text-sm text-fg2">{l.description}</p>}
      </div>
    </Link>
  );
}

export function ListsView() {
  const q = useQuery({ queryKey: ["lists"], queryFn: () => get<{ pinned: ListDTO[]; yours: ListDTO[]; discover: ListDTO[] }>("/lists") });
  return (
    <div>
      <PageHeader
        title="Circles"
        back
        right={
          <Link href="/i/lists/create" aria-label="Create a new Circle" title="Create a new Circle" className="grid h-[34px] w-[34px] place-items-center rounded-xl text-accent-text hover:bg-accent-soft">
            <Plus size={22} />
          </Link>
        }
      />
      {q.isPending && <Spinner className="py-8" />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data && (
        <>
          <SectionHeading>Pinned Circles</SectionHeading>
          {q.data.pinned.length ? (
            <div className="flex gap-4 overflow-x-auto border-b border-line px-4 pb-4 no-scrollbar">
              {q.data.pinned.map((l) => (
                <Link key={l.id} href={`/i/lists/${l.id}`} className="flex w-[80px] shrink-0 flex-col items-center gap-1 text-center text-sm">
                  <span className="grid h-[64px] w-[64px] place-items-center overflow-hidden rounded-xl bg-subtle">
                    {l.bannerUrl ? <img src={l.bannerUrl} alt="" className="h-full w-full object-cover" /> : <ScrollText size={24} className="text-fg2" />}
                  </span>
                  <span className="line-clamp-2 break-anywhere">{l.name}</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="border-b border-line px-4 pb-4 text-fg2">Nothing to see here yet — pin your favorite Circles to access them quickly.</p>
          )}
          <SectionHeading>Your Circles</SectionHeading>
          {q.data.yours.length ? q.data.yours.map((l) => <ListCard key={l.id} l={l} />) : <p className="px-4 pb-4 text-fg2">You haven’t created or followed any Circles. When you do, they’ll show up here.</p>}
          {q.data.discover.length > 0 && (
            <>
              <div className="mt-2 border-t border-line" />
              <SectionHeading>Discover new Circles</SectionHeading>
              {q.data.discover.map((l) => <ListCard key={l.id} l={l} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}

function useListMutations(id: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const set = (l: ListDTO) => {
    qc.setQueryData(["list", id], l);
    qc.invalidateQueries({ queryKey: ["lists"] });
  };
  const sub = useMutation({ mutationFn: (on: boolean) => (on ? put<ListDTO>(`/lists/${id}/subscription`) : del<ListDTO>(`/lists/${id}/subscription`)), onSuccess: set, onError: (e) => toast({ text: errorMessage(e), tone: "error" }) });
  const pin = useMutation({ mutationFn: (on: boolean) => (on ? put<ListDTO>(`/lists/${id}/pin`) : del<ListDTO>(`/lists/${id}/pin`)), onSuccess: (l) => { set(l); toast({ text: l.viewer.pinned ? "Circle pinned" : "Circle unpinned" }); }, onError: (e) => toast({ text: errorMessage(e), tone: "error" }) });
  return { sub, pin };
}

export function ListView({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const dialogs = useDialogs();
  const q = useQuery({ queryKey: ["list", id], queryFn: () => get<ListDTO>(`/lists/${id}`) });
  const { sub, pin } = useListMutations(id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useMutation({
    mutationFn: () => del(`/lists/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lists"] });
      toast({ text: "Circle deleted" });
      router.push("/i/lists");
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  if (q.isPending) return <div><PageHeader title="Circle" back /><Spinner className="py-8" /></div>;
  if (q.isError)
    return (
      <div>
        <PageHeader title="Circle" back />
        {q.error instanceof ApiError && q.error.status === 404 ? <EmptyState title="This Circle doesn’t exist" body="It may be private or deleted." /> : <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      </div>
    );
  const l = q.data;
  return (
    <div>
      <PageHeader
        title={l.name}
        subtitle={`@${l.owner.handle}`}
        back
        right={
          <Menu label="More" trigger={<button type="button" aria-label="More" className="grid h-[34px] w-[34px] place-items-center rounded-xl text-accent-text hover:bg-accent-soft"><MoreHorizontal size={20} /></button>}>
            <MenuItem icon={l.viewer.pinned ? <PinOff /> : <Pin />} onSelect={() => pin.mutate(!l.viewer.pinned)}>{l.viewer.pinned ? "Unpin Circle" : "Pin Circle"}</MenuItem>
            {l.viewer.isOwner ? (
              <>
                <MenuItem icon={<Pencil />} href={`/i/lists/${l.id}/edit`}>Edit Circle</MenuItem>
                <MenuItem icon={<Trash2 />} danger onSelect={() => setConfirmDelete(true)}>Delete Circle</MenuItem>
              </>
            ) : (
              <MenuItem icon={<Flag />} onSelect={() => dialogs.report({ type: "LIST", id: l.id, label: `Circle “${l.name}”` })}>Report Circle</MenuItem>
            )}
          </Menu>
        }
      />
      <div className="aspect-[3/1] w-full overflow-hidden bg-line-strong">
        {l.bannerUrl && <img src={l.bannerUrl} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="border-b border-line px-4 py-4 text-center">
        <h2 className="flex items-center justify-center gap-1 text-title font-extrabold break-anywhere">
          {l.name} {l.isPrivate && <Lock size={18} aria-label="Private circle" />}
        </h2>
        {l.description && <p className="mt-1 break-anywhere">{l.description}</p>}
        <Link href={`/${l.owner.handle}`} className="mt-2 inline-flex items-center gap-1 hover:underline">
          <Avatar user={l.owner} size={20} /> <DisplayName user={l.owner} /> <span className="text-fg2">@{l.owner.handle}</span>
        </Link>
        <div className="mt-2 flex justify-center gap-4">
          <Link href={`/i/lists/${l.id}/members`} className="hover:underline"><b>{l.memberCount}</b> <span className="text-fg2">Members</span></Link>
          <Link href={`/i/lists/${l.id}/followers`} className="hover:underline"><b>{l.subscriberCount}</b> <span className="text-fg2">Followers</span></Link>
        </div>
        <div className="mt-3">
          {l.viewer.isOwner ? (
            <Link href={`/i/lists/${l.id}/edit`}><Button variant="outline">Edit Circle</Button></Link>
          ) : (
            <Button variant={l.viewer.subscribed ? "primary" : "outline"} disabled={sub.isPending} onClick={() => sub.mutate(!l.viewer.subscribed)}>
              {l.viewer.subscribed ? "Following" : "Follow"}
            </Button>
          )}
        </div>
      </div>
      <Timeline
        queryKey={["list-timeline", id]}
        path={`/lists/${id}/timeline`}
        empty={<EmptyState title="There aren’t any posts in this Circle" body={l.memberCount ? "When the members post, their posts will show up here." : "Add people to this Circle to see their posts here."} action={l.viewer.isOwner ? <Link href={`/i/lists/${l.id}/members`}><Button>Add members</Button></Link> : undefined} />}
      />
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete Circle?" body="This can’t be undone and you’ll lose your Circle." confirmLabel="Delete" danger busy={remove.isPending} onConfirm={() => remove.mutate()} />
    </div>
  );
}

export function ListPeopleView({ id, kind }: { id: string; kind: "members" | "followers" }) {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ["list", id], queryFn: () => get<ListDTO>(`/lists/${id}`) });
  const q = useQuery({ queryKey: ["list-people", id, kind], queryFn: () => get<UserListItem[]>(`/lists/${id}/${kind}`) });
  const [search, setSearch] = useState("");
  const owner = list.data?.viewer.isOwner;
  const results = useQuery({ queryKey: ["list-add-search", search], queryFn: () => get<UserDTO[]>(`/mentions?q=${encodeURIComponent(search)}`), enabled: !!owner && kind === "members" && search.trim().length > 0 });
  const toggle = useMutation({
    mutationFn: ({ handle, on }: { handle: string; on: boolean }) => (on ? put<ListDTO>(`/lists/${id}/members/${handle}`) : del<ListDTO>(`/lists/${id}/members/${handle}`)),
    onSuccess: (l, v) => {
      qc.setQueryData(["list", id], l);
      qc.invalidateQueries({ queryKey: ["list-people", id] });
      qc.invalidateQueries({ queryKey: ["list-timeline", id] });
      toast({ text: v.on ? `Added @${v.handle} to ${l.name}` : `Removed @${v.handle} from ${l.name}` });
    },
    onError: (e) => toast({ text: errorMessage(e), tone: "error" }),
  });
  const memberIds = new Set(q.data?.map((m) => m.user.id));
  return (
    <div>
      <PageHeader title={kind === "members" ? "Circle members" : "Circle followers"} subtitle={list.data?.name} back={`/i/lists/${id}`} />
      <RouteTabs active={kind} tabs={[{ key: "members", label: "Members", href: `/i/lists/${id}/members` }, { key: "followers", label: "Followers", href: `/i/lists/${id}/followers` }]} />
      {owner && kind === "members" && (
        <div className="border-b border-line px-4 py-3">
          <label htmlFor="list-add" className="text-sm font-bold">Add people</label>
          <input id="list-add" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people" className="mt-1 h-10 w-full rounded-xl bg-input px-4 outline-none" />
          {results.data?.map((u) => (
            <div key={u.id} className="flex items-center gap-3 py-2">
              <Avatar user={u} size={40} />
              <div className="min-w-0 flex-1"><DisplayName user={u} /><div className="text-sm text-fg2">@{u.handle}</div></div>
              <Button size="sm" variant={memberIds.has(u.id) ? "danger-outline" : "outline"} disabled={toggle.isPending} onClick={() => toggle.mutate({ handle: u.handle, on: !memberIds.has(u.id) })}>
                {memberIds.has(u.id) ? "Remove" : "Add"}
              </Button>
            </div>
          ))}
        </div>
      )}
      {q.isPending && <UserSkeleton count={4} />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title={kind === "members" ? "There isn’t anyone in this Circle" : "This Circle doesn’t have followers yet"} body={kind === "members" ? "When people get added, they’ll show up here." : "When people follow this Circle, they’ll show up here."} />}
      {q.data?.map((it) => (
        <UserCell
          key={it.user.id}
          item={it}
          action={owner && kind === "members" ? <Button size="sm" variant="danger-outline" onClick={() => toggle.mutate({ handle: it.user.handle, on: false })}>Remove</Button> : undefined}
        />
      ))}
    </div>
  );
}

export function ListEditor({ id }: { id?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const existing = useQuery({ queryKey: ["list", id], queryFn: () => get<ListDTO>(`/lists/${id}`), enabled: !!id });
  const [form, setForm] = useState<{ name: string; description: string; isPrivate: boolean; bannerMediaId: string | null; bannerUrl: string | null } | null>(id ? null : { name: "", description: "", isPrivate: false, bannerMediaId: null, bannerUrl: null });
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  if (id && existing.data && !form) setForm({ name: existing.data.name, description: existing.data.description, isPrivate: existing.data.isPrivate, bannerMediaId: existing.data.bannerMediaId, bannerUrl: existing.data.bannerUrl });
  const save = useMutation({
    mutationFn: () => {
      const body = { name: form!.name, description: form!.description, isPrivate: form!.isPrivate, bannerMediaId: form!.bannerMediaId };
      return id ? patch<ListDTO>(`/lists/${id}`, body) : post<ListDTO>("/lists", body);
    },
    onSuccess: (l) => {
      qc.setQueryData(["list", l.id], l);
      qc.invalidateQueries({ queryKey: ["lists"] });
      toast({ text: id ? "Circle updated" : "Circle created" });
      router.push(id ? `/i/lists/${l.id}` : `/i/lists/${l.id}/members`);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  if (id && existing.isError) return <div><PageHeader title="Edit Circle" back /><ErrorState message={errorMessage(existing.error)} /></div>;
  if (!form) return <div><PageHeader title="Edit Circle" back /><Spinner className="py-8" /></div>;
  if (id && existing.data && !existing.data.viewer.isOwner) return <div><PageHeader title="Edit Circle" back /><EmptyState title="You can’t edit this Circle" body="Only the Circle owner can edit it." /></div>;
  const nameLen = graphemeLength(form.name.trim());
  const valid = nameLen >= 1 && nameLen <= LIST_NAME_MAX && graphemeLength(form.description) <= LIST_DESC_MAX && !uploading;
  return (
    <div>
      <PageHeader title={id ? "Edit Circle" : "Create a new Circle"} back right={<Button size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : id ? "Done" : "Next"}</Button>} />
      <div className="relative aspect-[3/1] w-full overflow-hidden bg-line-strong">
        {form.bannerUrl && <img src={form.bannerUrl} alt="" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/30">
          <button type="button" aria-label="Add cover photo" onClick={() => file.current?.click()} className="grid h-11 w-11 place-items-center rounded-xl bg-black/60 text-white hover:bg-black/40">
            {uploading ? <Spinner size={20} /> : <Camera size={20} />}
          </button>
          {form.bannerMediaId && (
            <button type="button" aria-label="Remove cover photo" onClick={() => setForm({ ...form, bannerMediaId: null, bannerUrl: null })} className="grid h-11 w-11 place-items-center rounded-xl bg-black/60 text-white hover:bg-black/40">
              <X size={20} />
            </button>
          )}
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
            setError(null);
            try {
              const m = await uploadFile<MediaDTO>(f, { scope: "LIST" }, () => {}).promise;
              setForm((prev) => (prev ? { ...prev, bannerMediaId: m.id, bannerUrl: m.url } : prev));
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setUploading(false);
            }
          }}
        />
      </div>
      <TextField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} max={LIST_NAME_MAX} />
      <TextField label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} max={LIST_DESC_MAX} multiline />
      <Checkbox label="Make private" description="When you make a Circle private, only you can see it. Its followers are removed." checked={form.isPrivate} onChange={(v) => setForm({ ...form, isPrivate: v })} />
      {id && (
        <Link href={`/i/lists/${id}/members`} className="block border-t border-line px-4 py-4 hover:bg-hover">Manage members</Link>
      )}
      {error && <p className="px-4 py-2 text-danger" role="alert">{error}</p>}
    </div>
  );
}

/** /:handle/lists and /:handle/lists/memberships */
export function ProfileListsView({ handle, kind }: { handle: string; kind: "owned" | "memberships" }) {
  const q = useQuery({ queryKey: ["profile-lists", handle, kind], queryFn: () => get<ListDTO[]>(`/users/${handle}/${kind === "owned" ? "lists" : "memberships"}`) });
  return (
    <div>
      <PageHeader title={kind === "owned" ? "Circles" : "Circles they’re on"} subtitle={`@${handle}`} back={`/${handle}`} />
      <RouteTabs active={kind} tabs={[{ key: "owned", label: "Subscribed to", href: `/${handle}/lists` }, { key: "memberships", label: "Member of", href: `/${handle}/lists/memberships` }]} />
      {q.isPending && <Spinner className="py-8" />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title={kind === "owned" ? `@${handle} hasn’t created any Circles` : `@${handle} isn’t on any public Circles`} />}
      {q.data?.map((l) => <ListCard key={l.id} l={l} />)}
    </div>
  );
}
