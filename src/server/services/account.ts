import { prisma } from "../db";
import type { RequestContext } from "../context";
import { isMember } from "../viewer";
import { supabaseConfigured } from "@/lib/supabase/config";
import { env } from "../env";
import { invalid, notFound } from "../errors";
import { rateLimit } from "../ratelimit";
import { loadViewerGraph, toUserDTO, userSelect } from "./graph";
import { unreadNotificationCount } from "./notifications";
import { unreadConversationCount } from "./messages";
import type { PreferencesDTO, SessionDTO } from "@/lib/types";

export const DEFAULT_PREFERENCES: PreferencesDTO = {
  theme: "DEFAULT", accent: "brand", fontScale: 100, reducedMotion: false, autoplay: true, dataSaver: false,
  showSensitiveMedia: false, altTextReminder: false, timelineMode: "home", notifyLikes: true, notifyReposts: true,
  notifyReplies: true, notifyMentions: true, notifyFollows: true, notifyQuotes: true, filterNotFollowing: false,
  filterNoAvatar: false, showReadReceipts: true, searchHideSensitive: true,
};

export async function getPreferences(ctx: RequestContext): Promise<PreferencesDTO> {
  // Guests and onboarding viewers have no profile row: defaults, no writes.
  if (!isMember(ctx)) return { ...DEFAULT_PREFERENCES };
  const p = await prisma.preferences.upsert({
    where: { userId: ctx.actor.id },
    create: { userId: ctx.actor.id, workspaceId: ctx.workspace.id },
    update: {},
  });
  return {
    theme: p.theme,
    accent: p.accent,
    fontScale: p.fontScale,
    reducedMotion: p.reducedMotion,
    autoplay: p.autoplay,
    dataSaver: p.dataSaver,
    showSensitiveMedia: p.showSensitiveMedia,
    altTextReminder: p.altTextReminder,
    timelineMode: p.timelineMode === "latest" ? "latest" : "home",
    notifyLikes: p.notifyLikes,
    notifyReposts: p.notifyReposts,
    notifyReplies: p.notifyReplies,
    notifyMentions: p.notifyMentions,
    notifyFollows: p.notifyFollows,
    notifyQuotes: p.notifyQuotes,
    filterNotFollowing: p.filterNotFollowing,
    filterNoAvatar: p.filterNoAvatar,
    showReadReceipts: p.showReadReceipts,
    searchHideSensitive: p.searchHideSensitive,
  };
}

export async function updatePreferences(ctx: RequestContext, patch: Partial<PreferencesDTO>) {
  await prisma.preferences.upsert({
    where: { userId: ctx.actor.id },
    create: { userId: ctx.actor.id, workspaceId: ctx.workspace.id, ...patch },
    update: patch,
  });
  return getPreferences(ctx);
}

export async function getSession(ctx: RequestContext): Promise<SessionDTO> {
  const common = {
    mode: ctx.mode,
    viewer: ctx.viewer ?? "member",
    account: ctx.auth ? { email: ctx.auth.email, providers: ctx.auth.providers } : null,
    authEnabled: ctx.mode === "live" && supabaseConfigured(),
    workspace: { id: ctx.workspace.id, createdAt: ctx.workspace.createdAt.toISOString(), expiresAt: ctx.workspace.expiresAt?.toISOString() ?? null, retentionDays: env.retentionDays },
    capabilities: ctx.capabilities,
  } as const;
  if (!isMember(ctx)) {
    return {
      ...common,
      actor: { id: ctx.actor.id, handle: "", displayName: ctx.viewer === "onboarding" ? "New account" : "Guest", avatarUrl: null, isProtected: false, demoTeamBadge: false, dmPolicy: "EVERYONE" },
      preferences: { ...DEFAULT_PREFERENCES },
      badges: { notifications: 0, messages: 0, followRequests: 0 },
    };
  }
  const g = await loadViewerGraph(prisma, ctx);
  const [user, prefs, notifications, messages, followRequests] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: ctx.actor.id }, select: { ...userSelect, dmPolicy: true } }),
    getPreferences(ctx),
    unreadNotificationCount(ctx, g),
    unreadConversationCount(ctx),
    prisma.followRequest.count({ where: { workspaceId: ctx.workspace.id, targetId: ctx.actor.id } }),
  ]);
  return {
    ...common,
    actor: { ...toUserDTO(user), isProtected: user.isProtected, dmPolicy: user.dmPolicy },
    preferences: prefs,
    badges: { notifications, messages, followRequests },
  };
}

export async function badges(ctx: RequestContext) {
  if (!isMember(ctx)) return { notifications: 0, messages: 0, followRequests: 0 };
  const g = await loadViewerGraph(prisma, ctx);
  const [notifications, messages, followRequests] = await Promise.all([
    unreadNotificationCount(ctx, g),
    unreadConversationCount(ctx),
    prisma.followRequest.count({ where: { workspaceId: ctx.workspace.id, targetId: ctx.actor.id } }),
  ]);
  return { notifications, messages, followRequests };
}

// ------------------------------ muted words -------------------------------------

export async function listMutedWords(ctx: RequestContext) {
  const rows = await prisma.mutedWord.findMany({ where: { workspaceId: ctx.workspace.id, userId: ctx.actor.id }, orderBy: { createdAt: "desc" } });
  const now = Date.now();
  return rows.map((r) => ({ id: r.id, phrase: r.phrase, inHome: r.inHome, inNotifications: r.inNotifications, expiresAt: r.expiresAt?.toISOString() ?? null, expired: !!r.expiresAt && r.expiresAt.getTime() <= now }));
}

export async function addMutedWord(ctx: RequestContext, d: { phrase: string; inHome: boolean; inNotifications: boolean; durationHours: number | null }) {
  if (!d.inHome && !d.inNotifications) throw invalid("Choose at least one place to mute this in.");
  const n = await prisma.mutedWord.count({ where: { userId: ctx.actor.id } });
  if (n >= 200) throw invalid("You can mute up to 200 words in the demo.");
  await prisma.mutedWord.upsert({
    where: { userId_phraseLower: { userId: ctx.actor.id, phraseLower: d.phrase.toLowerCase() } },
    create: { workspaceId: ctx.workspace.id, userId: ctx.actor.id, phrase: d.phrase, phraseLower: d.phrase.toLowerCase(), inHome: d.inHome, inNotifications: d.inNotifications, expiresAt: d.durationHours ? new Date(Date.now() + d.durationHours * 3600_000) : null },
    update: { inHome: d.inHome, inNotifications: d.inNotifications, expiresAt: d.durationHours ? new Date(Date.now() + d.durationHours * 3600_000) : null },
  });
  return listMutedWords(ctx);
}

export async function removeMutedWord(ctx: RequestContext, id: string) {
  const r = await prisma.mutedWord.deleteMany({ where: { workspaceId: ctx.workspace.id, userId: ctx.actor.id, id } });
  if (!r.count) throw notFound("That muted word");
  return listMutedWords(ctx);
}

// ------------------------------ reports -----------------------------------------

/**
 * Persists a report and returns a truthful receipt. No automated moderation decision
 * is made, and none is claimed.
 */
export async function createReport(ctx: RequestContext, d: { targetType: "POST" | "USER" | "MESSAGE" | "LIST"; targetId: string; category: string; details: string }) {
  await rateLimit(`report:${ctx.actor.id}`, 30, 3600);
  const ws = ctx.workspace.id;
  const exists =
    d.targetType === "POST"
      ? await prisma.post.count({ where: { workspaceId: ws, id: d.targetId } })
      : d.targetType === "USER"
        ? await prisma.user.count({ where: { workspaceId: ws, id: d.targetId } })
        : d.targetType === "LIST"
          ? await prisma.list.count({ where: { workspaceId: ws, id: d.targetId } })
          : await prisma.message.count({ where: { workspaceId: ws, id: d.targetId, conversation: { participants: { some: { userId: ctx.actor.id } } } } });
  if (!exists) throw notFound("The reported item");
  const r = await prisma.report.create({ data: { workspaceId: ws, reporterId: ctx.actor.id, targetType: d.targetType, targetId: d.targetId, category: d.category, details: d.details } });
  return { id: r.id, status: "received" as const, createdAt: r.createdAt.toISOString() };
}

export async function myReports(ctx: RequestContext) {
  const rows = await prisma.report.findMany({ where: { workspaceId: ctx.workspace.id, reporterId: ctx.actor.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return rows.map((r) => ({ id: r.id, targetType: r.targetType, category: r.category, status: r.status, createdAt: r.createdAt.toISOString() }));
}
