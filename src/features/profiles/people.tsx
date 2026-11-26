"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Avatar, DisplayName } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { del, put, errorMessage } from "@/lib/api";
import type { ProfileDTO, RelationshipDTO, UserDTO, UserListItem } from "@/lib/types";

/** Follow / Following / Pending / Blocked pill with legacy hover states and confirmations. */
export function FollowButton({ user, relationship, size = "md", onChange }: { user: UserDTO; relationship: RelationshipDTO; size?: "sm" | "md"; onChange?: (p: ProfileDTO) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [hover, setHover] = useState(false);
  const [confirm, setConfirm] = useState<null | "unfollow" | "cancel" | "unblock">(null);
  const [rel, setRel] = useState(relationship);
  const m = useMutation({
    mutationFn: async (action: "follow" | "unfollow" | "unblock") => {
      if (action === "follow") return put<ProfileDTO>(`/users/${user.handle}/follow`);
      if (action === "unfollow") return del<ProfileDTO>(`/users/${user.handle}/follow`);
      return del<ProfileDTO>(`/users/${user.handle}/block`);
    },
    onMutate: (action) => {
      const prev = rel;
      if (action === "follow") setRel({ ...rel, following: !user.isProtected, requested: user.isProtected });
      if (action === "unfollow") setRel({ ...rel, following: false, requested: false });
      if (action === "unblock") setRel({ ...rel, blocking: false });
      return { prev };
    },
    onError: (e, _a, c) => {
      if (c) setRel(c.prev);
      toast({ text: errorMessage(e), tone: "error" });
    },
    onSuccess: (p) => {
      setRel(p.relationship);
      qc.setQueryData(["profile", p.handle.toLowerCase()], p);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["timeline"] });
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      onChange?.(p);
    },
  });
  const h = size === "sm" ? "min-h-[30px] px-4 text-sm" : "min-h-[36px] px-4";
  let btn;
  if (rel.blocking) {
    btn = (
      <button type="button" onClick={(e) => { e.stopPropagation(); setConfirm("unblock"); }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className={clsx("rounded-full bg-danger font-bold text-white hover:bg-danger-hover", h)}>
        {hover ? "Unblock" : "Blocked"}
      </button>
    );
  } else if (rel.following) {
    btn = (
      <button
        type="button"
        aria-label={`Following @${user.handle}. Click to unfollow.`}
        onClick={(e) => { e.stopPropagation(); setConfirm("unfollow"); }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={clsx("min-w-[102px] rounded-full font-bold", h, hover ? "bg-danger text-white" : "bg-accent text-accent-on")}
      >
        {hover ? "Unfollow" : "Following"}
      </button>
    );
  } else if (rel.requested) {
    btn = (
      <button type="button" onClick={(e) => { e.stopPropagation(); setConfirm("cancel"); }} className={clsx("rounded-full border border-accent font-bold text-accent-text hover:bg-accent-soft", h)}>
        Pending
      </button>
    );
  } else if (rel.blockedBy) {
    btn = null;
  } else {
    btn = (
      <button type="button" disabled={m.isPending} onClick={(e) => { e.stopPropagation(); m.mutate("follow"); }} className={clsx("rounded-full border border-accent font-bold text-accent-text hover:bg-accent-soft disabled:opacity-50", h)}>
        Follow
      </button>
    );
  }
  return (
    <>
      {btn}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "unblock" ? `Unblock @${user.handle}?` : confirm === "cancel" ? "Cancel follow request?" : `Unfollow @${user.handle}?`}
        body={
          confirm === "unblock"
            ? "They will be able to follow you and view your posts."
            : confirm === "cancel"
              ? `This will cancel your pending request, and @${user.handle} will no longer see it.`
              : user.isProtected
                ? "Their posts will no longer show up in your home timeline, and you’ll need to send a new request to see them."
                : "Their posts will no longer show up in your home timeline. You can still view their profile."
        }
        confirmLabel={confirm === "unblock" ? "Unblock" : confirm === "cancel" ? "Discard" : "Unfollow"}
        danger={confirm !== "unblock"}
        onConfirm={() => {
          const a = confirm;
          setConfirm(null);
          if (a === "unblock") m.mutate("unblock");
          else m.mutate("unfollow");
        }}
      />
    </>
  );
}

export function UserCell({ item, showBio = true, action }: { item: UserListItem; showBio?: boolean; action?: React.ReactNode }) {
  const u = item.user;
  return (
    <div className="flex gap-3 px-4 py-3 transition-colors hover:bg-hover">
      <Link href={`/${u.handle}`} aria-label={`${u.displayName} profile`}>
        <Avatar user={u} size={48} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <Link href={`/${u.handle}`} className="min-w-0 flex-1">
            <DisplayName user={u} className="hover:underline" />
            <div className="flex items-center gap-1 text-fg2">
              <span className="truncate">@{u.handle}</span>
              {item.relationship.followedBy && <span className="shrink-0 rounded bg-hover-strong px-1 text-xs">Follows you</span>}
            </div>
          </Link>
          {action ?? (!item.isSelf && <FollowButton user={u} relationship={item.relationship} size="sm" />)}
        </div>
        {showBio && item.bio && <p className="mt-1 break-anywhere">{item.bio}</p>}
      </div>
    </div>
  );
}
