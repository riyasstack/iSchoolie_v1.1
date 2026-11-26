/**
 * Direct messages.
 *
 * Acceptance: a new conversation lands in the recipient's inbox if they follow the
 * sender; otherwise it becomes a message request if they accept messages from
 * everyone; if they only accept messages from people they follow, sending is refused.
 * Blocks prevent messaging in both directions.
 *
 * Groups: any active member may add people and rename the group; only admins
 * (the creator) may remove members. Leaving is permanent for that conversation.
 *
 * Deleting a message removes it for the current viewer only. Removing a
 * conversation hides its existing history from the viewer's inbox; a newer
 * message brings it back.
 *
 * Delivery is near-realtime polling (client: 4s in an open conversation, 15s for
 * the inbox while visible). Read receipts reflect stored per-participant read
 * positions, shown only when both people allow read receipts.
 */
import { prisma, type Tx } from "../db";
import type { RequestContext } from "../context";
import { AppError, notFound, forbidden, invalid } from "../errors";
import { rateLimit } from "../ratelimit";
import { loadViewerGraph, toUserDTO, userSelect } from "./graph";
import { serializePosts, toMediaDTO, mediaSelect } from "./serialize";
import type { ConversationDTO, MessageDTO } from "@/lib/types";
import { publish } from "../realtime";
import type { Db } from "../db";

/** Tells the other active participants (ids only) that something changed. */
async function announce(db: Db, ctx: RequestContext, conversationId: string, type: "message" | "conversation" | "read", includeSelf = false) {
  const parts = await db.participant.findMany({ where: { conversationId, leftAt: null }, select: { userId: true } });
  const users = parts.map((p) => p.userId).filter((u) => includeSelf || u !== ctx.actor.id);
  await publish(db, { type, ws: ctx.workspace.id, users, conversationId });
}

const rid = () => crypto.randomUUID().replace(/-/g, "");

async function membership(ctx: RequestContext, conversationId: string) {
  const p = await prisma.participant.findUnique({
    where: { conversationId_userId: { conversationId, userId: ctx.actor.id } },
    include: { conversation: true },
  });
  if (!p || p.workspaceId !== ctx.workspace.id || p.leftAt) throw notFound("That conversation");
  return p;
}

/** Messages before this instant are not shown to the participant (removed history, or before joining a group). */
function lowerBound(p: { hiddenBefore: Date | null; joinedAt: Date }, kind: "DIRECT" | "GROUP"): Date {
  const hidden = p.hiddenBefore ?? new Date(0);
  const joined = kind === "GROUP" ? new Date(p.joinedAt.getTime() - 1) : new Date(0);
  return hidden > joined ? hidden : joined;
}

async function sendRestriction(ctx: RequestContext, convId: string, kind: "DIRECT" | "GROUP"): Promise<string | null> {
  if (kind === "GROUP") return null;
  const others = await prisma.participant.findMany({ where: { conversationId: convId, userId: { not: ctx.actor.id } }, include: { user: true } });
  const other = others[0];
  if (!other) return null;
  const block = await prisma.block.findFirst({ where: { workspaceId: ctx.workspace.id, OR: [{ blockerId: ctx.actor.id, blockedId: other.userId }, { blockerId: other.userId, blockedId: ctx.actor.id }] } });
  if (block) return block.blockerId === ctx.actor.id ? "You blocked this account. Unblock to send messages." : "You can’t send messages to this account.";
  if (other.user.suspended) return "This account is suspended.";
  if (other.leftAt) return "This person deleted the conversation.";
  return null;
}

export async function listConversations(ctx: RequestContext, box: "inbox" | "requests"): Promise<ConversationDTO[]> {
  const ws = ctx.workspace.id;
  const mine = await prisma.participant.findMany({
    where: { workspaceId: ws, userId: ctx.actor.id, leftAt: null, status: box === "inbox" ? "ACCEPTED" : "REQUEST" },
    include: { conversation: true },
    orderBy: { conversation: { lastMessageAt: "desc" } },
    take: 100,
  });
  const visible = mine.filter((p) => !p.hiddenBefore || p.conversation.lastMessageAt > p.hiddenBefore);
  return Promise.all(visible.map((p) => conversationDTO(ctx, p.conversationId)));
}

export async function conversationDTO(ctx: RequestContext, conversationId: string): Promise<ConversationDTO> {
  const me = await membership(ctx, conversationId);
  const conv = me.conversation;
  const parts = await prisma.participant.findMany({ where: { conversationId }, include: { user: { select: { ...userSelect } } } });
  const hiddenIds = (await prisma.messageHidden.findMany({ where: { workspaceId: ctx.workspace.id, userId: ctx.actor.id, message: { conversationId } }, select: { messageId: true } })).map((h) => h.messageId);
  const lower = lowerBound(me, conv.kind);
  const [last, unread] = await Promise.all([
    prisma.message.findFirst({ where: { workspaceId: ctx.workspace.id, conversationId, id: { notIn: hiddenIds }, createdAt: { gt: lower } }, orderBy: { createdAt: "desc" }, include: { attachments: { select: { mediaId: true } } } }),
    prisma.message.count({ where: { workspaceId: ctx.workspace.id, conversationId, senderId: { not: ctx.actor.id }, createdAt: { gt: me.lastReadAt > lower ? me.lastReadAt : lower }, id: { notIn: hiddenIds } } }),
  ]);
  const prefs = await prisma.preferences.findMany({ where: { userId: { in: parts.map((p) => p.userId) } }, select: { userId: true, showReadReceipts: true } });
  const receipts = new Map(prefs.map((p) => [p.userId, p.showReadReceipts]));
  const viewerAllows = receipts.get(ctx.actor.id) ?? true;
  const restriction = await sendRestriction(ctx, conversationId, conv.kind);
  return {
    id: conv.id,
    kind: conv.kind,
    name: conv.name,
    participants: parts.map((p) => ({ ...toUserDTO(p.user), role: p.role, active: !p.leftAt })),
    lastMessage: last ? { id: last.id, text: last.text, senderId: last.senderId, createdAt: last.createdAt.toISOString(), kind: last.kind, hasMedia: last.attachments.length > 0 || !!last.sharedPostId } : null,
    unreadCount: me.status === "ACCEPTED" ? unread : 0,
    muted: me.muted,
    status: me.status,
    viewerRole: me.role,
    viewerActive: !me.leftAt,
    draft: me.draft,
    lastMessageAt: conv.lastMessageAt.toISOString(),
    readBy: viewerAllows
      ? parts.filter((p) => p.userId !== ctx.actor.id && !p.leftAt && (receipts.get(p.userId) ?? true)).map((p) => ({ userId: p.userId, lastReadAt: p.lastReadAt.toISOString() }))
      : [],
    canSend: !restriction,
    sendRestriction: restriction,
  };
}

export async function unreadConversationCount(ctx: RequestContext) {
  const list = await listConversations(ctx, "inbox");
  return list.filter((c) => c.unreadCount > 0 && !c.muted).length;
}

export async function requestCount(ctx: RequestContext) {
  return (await listConversations(ctx, "requests")).length;
}

export async function listMessages(ctx: RequestContext, conversationId: string, opts: { before?: string | null; after?: string | null }) {
  const me = await membership(ctx, conversationId);
  const ws = ctx.workspace.id;
  const hidden = (await prisma.messageHidden.findMany({ where: { workspaceId: ws, userId: ctx.actor.id, message: { conversationId } }, select: { messageId: true } })).map((h) => h.messageId);
  const lower = lowerBound(me, me.conversation.kind);
  const PAGE = 30;
  const createdAt: { gt?: Date; lt?: Date } = { gt: lower };
  if (opts.after) createdAt.gt = new Date(Math.max(lower.getTime(), new Date(opts.after).getTime()));
  if (opts.before) createdAt.lt = new Date(opts.before);
  const rows = await prisma.message.findMany({
    where: { workspaceId: ws, conversationId, id: { notIn: hidden }, createdAt },
    orderBy: { createdAt: opts.after ? "asc" : "desc" },
    take: PAGE + 1,
    include: {
      sender: { select: userSelect },
      attachments: { include: { media: { select: mediaSelect } } },
      reactions: { include: { user: { select: { handle: true } } } },
    },
  });
  const page = rows.slice(0, PAGE);
  const g = await loadViewerGraph(prisma, ctx);
  const shared = await serializePosts(prisma, ctx, g, page.map((m) => m.sharedPostId).filter((x): x is string => !!x));
  const items: MessageDTO[] = page.map((m) => ({
    id: m.id,
    clientKey: m.clientKey,
    conversationId,
    sender: toUserDTO(m.sender),
    kind: m.kind,
    text: m.text,
    createdAt: m.createdAt.toISOString(),
    media: m.attachments.map((a) => toMediaDTO(a.media)),
    sharedPost: m.sharedPostId ? shared.get(m.sharedPostId) ?? { id: m.sharedPostId, unavailable: "not_found" } : null,
    reactions: m.reactions.map((r) => ({ emoji: r.emoji, userId: r.userId, handle: r.user.handle })),
  }));
  if (!opts.after) items.reverse();
  return { items, hasMore: rows.length > PAGE };
}

export async function markRead(ctx: RequestContext, conversationId: string) {
  const me = await membership(ctx, conversationId);
  if (me.status !== "ACCEPTED") return { ok: true };
  await prisma.participant.update({ where: { conversationId_userId: { conversationId, userId: ctx.actor.id } }, data: { lastReadAt: new Date() } });
  await announce(prisma, ctx, conversationId, "read");
  return { ok: true };
}

async function attachMedia(tx: Tx, ctx: RequestContext, messageId: string, mediaIds: string[]) {
  for (const mid of mediaIds) {
    const m = await tx.mediaAsset.findFirst({ where: { workspaceId: ctx.workspace.id, id: mid }, include: { postLinks: true, messageLinks: true } });
    if (!m || m.ownerId !== ctx.actor.id) throw invalid("That attachment isn’t available.");
    if (m.scope !== "MESSAGE") throw invalid("That file can’t be sent in a message.");
    if (m.status !== "READY") throw invalid("The attachment is still processing.");
    if (m.postLinks.length || m.messageLinks.length) throw invalid("That attachment was already sent.");
    await tx.messageAttachment.create({ data: { workspaceId: ctx.workspace.id, messageId, mediaId: mid } });
  }
}

export async function sendMessage(ctx: RequestContext, conversationId: string, input: { text: string; mediaIds: string[]; sharedPostId: string | null; clientKey: string }): Promise<MessageDTO> {
  await rateLimit(`dm:${ctx.actor.id}`, 120, 600, "You’re sending messages too quickly.");
  const ws = ctx.workspace.id;
  // Idempotency: a retry with the same client key returns the stored message.
  const existing = await prisma.message.findUnique({ where: { senderId_clientKey: { senderId: ctx.actor.id, clientKey: input.clientKey } } });
  if (existing) {
    if (existing.conversationId !== conversationId) throw invalid("Duplicate message key.");
    return (await messageById(ctx, existing.id))!;
  }
  const me = await membership(ctx, conversationId);
  if (!input.text.trim() && !input.mediaIds.length && !input.sharedPostId) throw invalid("Write a message or attach something.");
  const restriction = await sendRestriction(ctx, conversationId, me.conversation.kind);
  if (restriction) throw forbidden(restriction);
  if (input.sharedPostId) {
    const g = await loadViewerGraph(prisma, ctx);
    const map = await serializePosts(prisma, ctx, g, [input.sharedPostId]);
    const p = map.get(input.sharedPostId);
    if (!p || "unavailable" in p) throw invalid("That post can’t be shared.");
  }
  const id = rid();
  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.message.create({ data: { id, workspaceId: ws, conversationId, senderId: ctx.actor.id, text: input.text, sharedPostId: input.sharedPostId, clientKey: input.clientKey, createdAt: now } });
      await attachMedia(tx, ctx, id, input.mediaIds);
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } });
      // Sending implies the sender accepted (e.g. replying to a request) and has read up to now.
      await tx.participant.update({ where: { conversationId_userId: { conversationId, userId: ctx.actor.id } }, data: { status: "ACCEPTED", lastReadAt: now, draft: "" } });
      await announce(tx, ctx, conversationId, "message");
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      const again = await prisma.message.findUnique({ where: { senderId_clientKey: { senderId: ctx.actor.id, clientKey: input.clientKey } } });
      if (again) return (await messageById(ctx, again.id))!;
    }
    throw e;
  }
  return (await messageById(ctx, id))!;
}

async function messageById(ctx: RequestContext, id: string): Promise<MessageDTO | null> {
  const m = await prisma.message.findFirst({ where: { workspaceId: ctx.workspace.id, id }, select: { conversationId: true, createdAt: true } });
  if (!m) return null;
  const { items } = await listMessages(ctx, m.conversationId, { after: new Date(m.createdAt.getTime() - 1).toISOString() });
  return items.find((x) => x.id === id) ?? null;
}

/** Start (or reuse) a conversation with one or more recipients. */
export async function startConversation(ctx: RequestContext, handles: string[], name?: string | null): Promise<ConversationDTO> {
  const ws = ctx.workspace.id;
  const me = ctx.actor.id;
  const uniq = Array.from(new Set(handles.map((h) => h.toLowerCase())));
  if (!uniq.length) throw invalid("Choose at least one person.");
  if (uniq.length > 49) throw invalid("Groups can have up to 50 people.");
  const users = await prisma.user.findMany({ where: { workspaceId: ws, handleLower: { in: uniq } } });
  if (users.length !== uniq.length) throw invalid("Some of those accounts don’t exist.");
  const recipients = users.filter((u) => u.id !== me);
  if (!recipients.length) throw invalid("Choose someone other than yourself.");
  const blocks = await prisma.block.findMany({ where: { workspaceId: ws, OR: [{ blockerId: me, blockedId: { in: recipients.map((r) => r.id) } }, { blockedId: me, blockerId: { in: recipients.map((r) => r.id) } }] } });
  if (blocks.length) throw forbidden("You can’t message one of these accounts.");
  if (recipients.some((r) => r.suspended)) throw forbidden("One of these accounts is suspended.");
  // Who follows me (decides inbox vs request).
  const followsMe = new Set((await prisma.follow.findMany({ where: { workspaceId: ws, followeeId: me, followerId: { in: recipients.map((r) => r.id) } } })).map((f) => f.followerId));
  for (const r of recipients) {
    if (!followsMe.has(r.id) && r.dmPolicy === "FOLLOWING") throw forbidden(`@${r.handle} only accepts messages from people they follow.`);
  }
  if (recipients.length === 1) {
    const directKey = [me, recipients[0].id].sort().join(":");
    const existing = await prisma.conversation.findUnique({ where: { workspaceId_directKey: { workspaceId: ws, directKey } } });
    if (existing) {
      // Rejoin if the viewer had removed it.
      await prisma.participant.updateMany({ where: { conversationId: existing.id, userId: me }, data: { leftAt: null, status: "ACCEPTED" } });
      return conversationDTO(ctx, existing.id);
    }
    const cid = rid();
    try {
      await prisma.$transaction(async (tx) => {
        await tx.conversation.create({ data: { id: cid, workspaceId: ws, kind: "DIRECT", directKey, createdById: me } });
        await tx.participant.createMany({
          data: [
            { workspaceId: ws, conversationId: cid, userId: me, role: "ADMIN", status: "ACCEPTED" },
            { workspaceId: ws, conversationId: cid, userId: recipients[0].id, role: "MEMBER", status: followsMe.has(recipients[0].id) ? "ACCEPTED" : "REQUEST", lastReadAt: new Date(0) },
          ],
        });
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        const again = await prisma.conversation.findUniqueOrThrow({ where: { workspaceId_directKey: { workspaceId: ws, directKey } } });
        return conversationDTO(ctx, again.id);
      }
      throw e;
    }
    await announce(prisma, ctx, cid, "conversation");
    return conversationDTO(ctx, cid);
  }
  const cid = rid();
  await prisma.$transaction(async (tx) => {
    await tx.conversation.create({ data: { id: cid, workspaceId: ws, kind: "GROUP", name: name?.trim() || null, createdById: me } });
    await tx.participant.createMany({
      data: [
        { workspaceId: ws, conversationId: cid, userId: me, role: "ADMIN", status: "ACCEPTED" },
        ...recipients.map((r) => ({ workspaceId: ws, conversationId: cid, userId: r.id, role: "MEMBER" as const, status: followsMe.has(r.id) ? ("ACCEPTED" as const) : ("REQUEST" as const), lastReadAt: new Date(0) })),
      ],
    });
    await tx.message.create({ data: { workspaceId: ws, conversationId: cid, senderId: me, kind: "SYSTEM", text: `created the group`, clientKey: `sys-${rid()}` } });
    await announce(tx, ctx, cid, "message");
  });
  return conversationDTO(ctx, cid);
}

export async function respondToRequest(ctx: RequestContext, conversationId: string, action: "accept" | "delete") {
  const me = await membership(ctx, conversationId);
  if (me.status !== "REQUEST") throw invalid("This isn’t a message request.");
  if (action === "accept") {
    await prisma.participant.update({ where: { conversationId_userId: { conversationId, userId: ctx.actor.id } }, data: { status: "ACCEPTED", lastReadAt: new Date() } });
  } else {
    await prisma.participant.update({ where: { conversationId_userId: { conversationId, userId: ctx.actor.id } }, data: { hiddenBefore: new Date() } });
  }
  return { ok: true };
}

export async function updateConversation(ctx: RequestContext, conversationId: string, patch: { name?: string | null; muted?: boolean; draft?: string }) {
  const me = await membership(ctx, conversationId);
  if (patch.name !== undefined) {
    if (me.conversation.kind !== "GROUP") throw invalid("Only groups have names.");
    const name = patch.name?.trim() || null;
    if (name && Array.from(name).length > 50) throw invalid("Group names are limited to 50 characters.");
    await prisma.$transaction([
      prisma.conversation.update({ where: { id: conversationId }, data: { name } }),
      prisma.message.create({ data: { workspaceId: ctx.workspace.id, conversationId, senderId: ctx.actor.id, kind: "SYSTEM", text: name ? `renamed the group to “${name}”` : "removed the group name", clientKey: `sys-${rid()}` } }),
    ]);
    await announce(prisma, ctx, conversationId, "message");
  }
  if (patch.muted !== undefined || patch.draft !== undefined) {
    await prisma.participant.update({
      where: { conversationId_userId: { conversationId, userId: ctx.actor.id } },
      data: { ...(patch.muted !== undefined ? { muted: patch.muted } : {}), ...(patch.draft !== undefined ? { draft: patch.draft.slice(0, 10000) } : {}) },
    });
  }
  return conversationDTO(ctx, conversationId);
}

export async function addMembers(ctx: RequestContext, conversationId: string, handles: string[]) {
  const me = await membership(ctx, conversationId);
  if (me.conversation.kind !== "GROUP") throw invalid("People can only be added to groups.");
  const ws = ctx.workspace.id;
  const users = await prisma.user.findMany({ where: { workspaceId: ws, handleLower: { in: handles.map((h) => h.toLowerCase()) }, suspended: false } });
  const count = await prisma.participant.count({ where: { conversationId, leftAt: null } });
  if (count + users.length > 50) throw invalid("Groups can have up to 50 people.");
  const blocks = await prisma.block.findMany({ where: { workspaceId: ws, OR: [{ blockerId: ctx.actor.id, blockedId: { in: users.map((u) => u.id) } }, { blockedId: ctx.actor.id, blockerId: { in: users.map((u) => u.id) } }] } });
  if (blocks.length) throw forbidden("You can’t add one of these accounts.");
  for (const u of users) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.participant.findUnique({ where: { conversationId_userId: { conversationId, userId: u.id } } });
      if (existing && !existing.leftAt) return;
      if (existing) await tx.participant.update({ where: { conversationId_userId: { conversationId, userId: u.id } }, data: { leftAt: null, joinedAt: new Date(), status: "ACCEPTED", role: "MEMBER" } });
      else await tx.participant.create({ data: { workspaceId: ws, conversationId, userId: u.id, role: "MEMBER", status: "ACCEPTED", lastReadAt: new Date(0) } });
      await tx.message.create({ data: { workspaceId: ws, conversationId, senderId: ctx.actor.id, kind: "SYSTEM", text: `added @${u.handle}`, clientKey: `sys-${rid()}` } });
      await announce(tx, ctx, conversationId, "message");
    });
  }
  return conversationDTO(ctx, conversationId);
}

export async function removeMember(ctx: RequestContext, conversationId: string, handle: string) {
  const me = await membership(ctx, conversationId);
  if (me.conversation.kind !== "GROUP") throw invalid("Not a group.");
  if (me.role !== "ADMIN") throw forbidden("Only the group admin can remove people.");
  const u = await prisma.user.findUnique({ where: { workspaceId_handleLower: { workspaceId: ctx.workspace.id, handleLower: handle.toLowerCase() } } });
  if (!u || u.id === ctx.actor.id) throw invalid("Choose another member.");
  await prisma.$transaction([
    prisma.participant.updateMany({ where: { conversationId, userId: u.id, leftAt: null }, data: { leftAt: new Date() } }),
    prisma.message.create({ data: { workspaceId: ctx.workspace.id, conversationId, senderId: ctx.actor.id, kind: "SYSTEM", text: `removed @${u.handle}`, clientKey: `sys-${rid()}` } }),
  ]);
  await announce(prisma, ctx, conversationId, "message");
  await publish(prisma, { type: "conversation", ws: ctx.workspace.id, users: [u.id], conversationId });
  return conversationDTO(ctx, conversationId);
}

/** Group: leave (others are told). Direct: remove from the viewer's inbox only. */
export async function leaveConversation(ctx: RequestContext, conversationId: string) {
  const me = await membership(ctx, conversationId);
  if (me.conversation.kind === "GROUP") {
    await prisma.$transaction(async (tx) => {
      await tx.message.create({ data: { workspaceId: ctx.workspace.id, conversationId, senderId: ctx.actor.id, kind: "SYSTEM", text: "left the group", clientKey: `sys-${rid()}` } });
      await tx.participant.update({ where: { conversationId_userId: { conversationId, userId: ctx.actor.id } }, data: { leftAt: new Date() } });
      // Hand admin to the longest-standing remaining member if the admin leaves.
      if (me.role === "ADMIN") {
        const next = await tx.participant.findFirst({ where: { conversationId, leftAt: null, userId: { not: ctx.actor.id } }, orderBy: { joinedAt: "asc" } });
        if (next) await tx.participant.update({ where: { conversationId_userId: { conversationId, userId: next.userId } }, data: { role: "ADMIN" } });
      }
      await announce(tx, ctx, conversationId, "message");
    });
  } else {
    await prisma.participant.update({ where: { conversationId_userId: { conversationId, userId: ctx.actor.id } }, data: { hiddenBefore: new Date() } });
  }
  return { ok: true };
}

export async function hideMessageForMe(ctx: RequestContext, messageId: string) {
  const m = await prisma.message.findFirst({ where: { workspaceId: ctx.workspace.id, id: messageId } });
  if (!m) throw notFound("That message");
  await membership(ctx, m.conversationId);
  await prisma.messageHidden.createMany({ data: [{ workspaceId: ctx.workspace.id, messageId, userId: ctx.actor.id }], skipDuplicates: true });
  return { ok: true };
}

export async function setReaction(ctx: RequestContext, messageId: string, emoji: string | null) {
  const m = await prisma.message.findFirst({ where: { workspaceId: ctx.workspace.id, id: messageId } });
  if (!m) throw notFound("That message");
  await membership(ctx, m.conversationId);
  const allowed = ["😂", "😲", "😢", "❤️", "🔥", "👍", "👎"];
  if (emoji && !allowed.includes(emoji)) throw invalid("Unsupported reaction.");
  if (!emoji) await prisma.messageReaction.deleteMany({ where: { messageId, userId: ctx.actor.id } });
  else
    await prisma.messageReaction.upsert({
      where: { messageId_userId: { messageId, userId: ctx.actor.id } },
      create: { workspaceId: ctx.workspace.id, messageId, userId: ctx.actor.id, emoji },
      update: { emoji },
    });
  await announce(prisma, ctx, m.conversationId, "conversation");
  return (await messageById(ctx, messageId))!;
}

export async function sharedMedia(ctx: RequestContext, conversationId: string) {
  const me = await membership(ctx, conversationId);
  const rows = await prisma.messageAttachment.findMany({
    where: { workspaceId: ctx.workspace.id, message: { conversationId, createdAt: { gt: me.hiddenBefore ?? new Date(0) }, hiddenFor: { none: { userId: ctx.actor.id } } } },
    include: { media: { select: mediaSelect }, message: { select: { createdAt: true } } },
    orderBy: { message: { createdAt: "desc" } },
    take: 60,
  });
  return rows.map((r) => toMediaDTO(r.media));
}

export async function searchRecipients(ctx: RequestContext, q: string) {
  const ws = ctx.workspace.id;
  const g = await loadViewerGraph(prisma, ctx);
  const s = q.replace(/^@/, "").trim().toLowerCase();
  const users = await prisma.user.findMany({
    where: { workspaceId: ws, suspended: false, id: { not: ctx.actor.id }, ...(s ? { OR: [{ handleLower: { contains: s } }, { displayName: { contains: s, mode: "insensitive" } }] } : { id: { in: [...g.following] } }) },
    select: { ...userSelect, dmPolicy: true },
    take: 20,
  });
  return users
    .filter((u) => !g.blockedBy.has(u.id))
    .map((u) => ({
      user: toUserDTO(u),
      canMessage: !g.blocking.has(u.id) && (u.dmPolicy === "EVERYONE" || g.followers.has(u.id)),
      reason: g.blocking.has(u.id) ? "You blocked this account" : u.dmPolicy === "FOLLOWING" && !g.followers.has(u.id) ? "Only accepts messages from people they follow" : null,
    }));
}

export function assertMember(ctx: RequestContext, conversationId: string) {
  return membership(ctx, conversationId).then(() => true).catch(() => {
    throw new AppError("NOT_FOUND", "That conversation doesn’t exist.");
  });
}
