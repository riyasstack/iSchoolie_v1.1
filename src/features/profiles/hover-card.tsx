"use client";
import Link from "next/link";
import { HoverCard } from "radix-ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { get } from "@/lib/api";
import { Avatar, DisplayName } from "@/components/ui/misc";
import { RichText } from "../posts/rich-text";
import { FollowButton } from "./people";
import { compactCount } from "@/lib/format";
import { Spinner } from "@/components/ui/spinner";
import type { ProfileDTO } from "@/lib/types";

/** Desktop-only profile hover card (pointer devices). Touch users navigate instead. */
export function ProfileHoverCard({ handle, children }: { handle: string; children: ReactNode }) {
  return (
    <HoverCard.Root openDelay={500} closeDelay={150}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="motion-fade z-[65] hidden w-[300px] rounded-card bg-elevated p-4 [@media(hover:hover)]:block"
          style={{ boxShadow: "var(--shadow)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <HoverBody handle={handle} />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

function HoverBody({ handle }: { handle: string }) {
  const q = useQuery({ queryKey: ["profile", handle.toLowerCase()], queryFn: () => get<ProfileDTO>(`/users/${handle}`), staleTime: 60_000 });
  if (q.isPending) return <Spinner />;
  if (q.isError) return <p className="text-fg2">Couldn’t load this profile.</p>;
  const p = q.data;
  return (
    <div>
      <div className="flex items-start justify-between">
        <Link href={`/${p.handle}`}>
          <Avatar user={p} size={64} />
        </Link>
        {!p.isSelf && !p.suspended && <FollowButton user={p} relationship={p.relationship} size="sm" />}
      </div>
      <Link href={`/${p.handle}`} className="mt-2 block hover:underline">
        <DisplayName user={p} className="text-[1.0625rem]" />
      </Link>
      <div className="text-fg2">
        @{p.handle}
        {p.relationship.followedBy && <span className="ml-1 rounded bg-hover-strong px-1 text-xs">Follows you</span>}
      </div>
      {p.bio && <RichText text={p.bio} className="mt-3" />}
      <div className="mt-3 flex gap-4">
        <Link href={`/${p.handle}/following`} className="hover:underline">
          <b>{compactCount(p.followingCount)}</b> <span className="text-fg2">Following</span>
        </Link>
        <Link href={`/${p.handle}/followers`} className="hover:underline">
          <b>{compactCount(p.followersCount)}</b> <span className="text-fg2">Followers</span>
        </Link>
      </div>
    </div>
  );
}
