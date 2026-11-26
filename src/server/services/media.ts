/**
 * Uploads and authorized media delivery.
 *
 * Accepted: JPEG/PNG/WebP images (≤ 5 MB, re-encoded server-side, which strips
 * EXIF/location metadata and normalises orientation), GIF (≤ 15 MB, animation kept),
 * MP4/WebM video (≤ 40 MB, stored as uploaded — no transcoding in this build).
 * File type is decided by content sniffing, not by the browser-supplied type.
 *
 * Delivery: /api/media/:id authorizes every read. Post media follows post
 * visibility; message media requires conversation membership (never cached
 * publicly); unattached uploads are visible only to their owner; profile, list
 * and moment images are visible inside the workspace.
 */
import sharp from "sharp";
import { prisma } from "../db";
import type { RequestContext } from "../context";
import { AppError, notFound, forbidden, invalid } from "../errors";
import { rateLimit } from "../ratelimit";
import { storage } from "../storage";
import { loadViewerGraph } from "./graph";
import { postAccess, authorAccess } from "../policy";
import { toMediaDTO } from "./serialize";
import { userSelect } from "./graph";
import { log } from "../log";

/**
 * Saving to storage is a different failure from an unreadable file: report it as such
 * (and log the cause) instead of telling the person their photo is damaged.
 */
async function save(key: string, data: Buffer) {
  try {
    await storage().put(key, data);
  } catch (e) {
    log("error", "storage_put_failed", { driver: process.env.STORAGE_DRIVER ?? "local", error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
    throw new AppError("INTERNAL", "Your upload couldn’t be saved right now. Try again in a moment.");
  }
}

export const LIMITS = { IMAGE: 5 * 1024 * 1024, GIF: 15 * 1024 * 1024, VIDEO: 40 * 1024 * 1024 };
const SCOPES = ["POST", "MESSAGE", "PROFILE", "LIST", "MOMENT"] as const;
type Scope = (typeof SCOPES)[number];

function sniff(buf: Buffer): { kind: "IMAGE" | "GIF" | "VIDEO"; mime: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { kind: "IMAGE", mime: "image/jpeg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: "IMAGE", mime: "image/png" };
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return { kind: "IMAGE", mime: "image/webp" };
  if (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a") return { kind: "GIF", mime: "image/gif" };
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") return { kind: "VIDEO", mime: "video/mp4" };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { kind: "VIDEO", mime: "video/webm" };
  return null;
}

export async function upload(
  ctx: RequestContext,
  file: File,
  opts: { scope: string; alt?: string; width?: number; height?: number; durationMs?: number; poster?: File },
) {
  await rateLimit(`upload:${ctx.actor.id}`, 60, 600, "Too many uploads. Try again in a few minutes.");
  if (!SCOPES.includes(opts.scope as Scope)) throw invalid("Unknown upload purpose.");
  const scope = opts.scope as Scope;
  // Storage quota: per demo workspace, or per member in the shared live network.
  const live = ctx.mode === "live";
  const used = await prisma.mediaAsset.aggregate({ where: { workspaceId: ctx.workspace.id, ...(live ? { ownerId: ctx.actor.id } : {}) }, _sum: { bytes: true } });
  if ((used._sum.bytes ?? 0) + file.size > 300 * 1024 * 1024) {
    throw new AppError("PAYLOAD_TOO_LARGE", live ? "You’ve reached your 300 MB upload limit. Delete some uploads to add more." : "This demo workspace has reached its 300 MB storage limit. Delete some uploads or reset the demo.");
  }
  if (file.size > LIMITS.VIDEO) throw new AppError("PAYLOAD_TOO_LARGE", "Files must be 40 MB or smaller.");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type) throw new AppError("UNSUPPORTED_MEDIA", "Unsupported file. Use JPEG, PNG, WebP, GIF, MP4 or WebM.");
  if (type.kind === "IMAGE" && buf.length > LIMITS.IMAGE) throw new AppError("PAYLOAD_TOO_LARGE", "Images must be 5 MB or smaller.");
  if (type.kind === "GIF" && buf.length > LIMITS.GIF) throw new AppError("PAYLOAD_TOO_LARGE", "GIFs must be 15 MB or smaller.");
  if (scope !== "POST" && scope !== "MESSAGE" && type.kind !== "IMAGE") throw invalid("Profile, list and Moment images must be JPEG, PNG or WebP.");

  const id = crypto.randomUUID().replace(/-/g, "");
  const base = `ws/${ctx.workspace.id}/${id}`;
  let storageKey: string;
  let thumbKey: string | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let mime = type.mime;
  let bytes = buf.length;
  try {
    if (type.kind === "IMAGE") {
      const img = sharp(buf, { failOn: "error", limitInputPixels: 50_000_000 }).rotate();
      const meta = await img.metadata();
      if (!meta.width || !meta.height) throw new Error("no dimensions");
      const maxSide = scope === "PROFILE" ? 1500 : 4096;
      const out = await img
        .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 86, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      width = out.info.width;
      height = out.info.height;
      mime = "image/jpeg";
      bytes = out.data.length;
      storageKey = `${base}.jpg`;
      await save(storageKey, out.data);
      if (Math.max(width, height) > 900) {
        const thumb = await sharp(out.data).resize({ width: 900, height: 900, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
        thumbKey = `${base}_thumb.jpg`;
        await save(thumbKey, thumb);
      }
    } else if (type.kind === "GIF") {
      const meta = await sharp(buf, { animated: true, limitInputPixels: 50_000_000 }).metadata();
      if (!meta.width) throw new Error("bad gif");
      width = meta.width;
      height = meta.pageHeight ?? meta.height ?? null;
      storageKey = `${base}.gif`;
      await save(storageKey, buf);
      const still = await sharp(buf, { pages: 1 }).jpeg({ quality: 80 }).toBuffer();
      thumbKey = `${base}_still.jpg`;
      await save(thumbKey, still);
    } else {
      storageKey = `${base}.${type.mime === "video/mp4" ? "mp4" : "webm"}`;
      await save(storageKey, buf);
      // Dimensions come from the client's decoded metadata (bounded); no server transcoding.
      const clamp = (n: number | undefined) => (n && Number.isFinite(n) && n > 0 && n <= 8192 ? Math.round(n) : null);
      width = clamp(opts.width);
      height = clamp(opts.height);
      // Poster frame captured by the browser; re-encoded like any image (optional).
      if (opts.poster && opts.poster.size <= LIMITS.IMAGE) {
        try {
          const p = await sharp(Buffer.from(await opts.poster.arrayBuffer()), { failOn: "error", limitInputPixels: 50_000_000 })
            .rotate()
            .resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toBuffer({ resolveWithObject: true });
          thumbKey = `${base}_poster.jpg`;
          await save(thumbKey, p.data);
          width = width ?? p.info.width;
          height = height ?? p.info.height;
        } catch {
          thumbKey = null; // an unreadable poster never blocks the video upload
        }
      }
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    log("warn", "media_decode_failed", { kind: type.kind, mime: type.mime, bytes: buf.length, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
    throw new AppError("UNSUPPORTED_MEDIA", "That file couldn’t be read. It may be damaged.");
  }
  const row = await prisma.mediaAsset.create({
    data: {
      id,
      workspaceId: ctx.workspace.id,
      ownerId: ctx.actor.id,
      kind: type.kind,
      scope,
      mime,
      storageKey,
      thumbKey,
      width,
      height,
      bytes,
      durationMs: opts.durationMs && opts.durationMs > 0 && opts.durationMs < 3_600_000 ? Math.round(opts.durationMs) : null,
      alt: (opts.alt ?? "").slice(0, 1000),
      status: "READY",
    },
  });
  return toMediaDTO(row);
}

export async function setAlt(ctx: RequestContext, id: string, alt: string) {
  const m = await prisma.mediaAsset.findFirst({ where: { workspaceId: ctx.workspace.id, id } });
  if (!m) throw notFound("That file");
  if (m.ownerId !== ctx.actor.id) throw forbidden("You can only describe your own media.");
  if (m.kind === "VIDEO") throw invalid("Descriptions are supported for photos and GIFs.");
  const row = await prisma.mediaAsset.update({ where: { id }, data: { alt } });
  return toMediaDTO(row);
}

export async function deleteUnattached(ctx: RequestContext, id: string) {
  const m = await prisma.mediaAsset.findFirst({ where: { workspaceId: ctx.workspace.id, id }, include: { postLinks: true, messageLinks: true } });
  if (!m || m.ownerId !== ctx.actor.id) throw notFound("That file");
  if (m.postLinks.length || m.messageLinks.length) throw invalid("Attached media can’t be deleted separately.");
  const inUse = await prisma.user.count({ where: { OR: [{ avatarMediaId: id }, { bannerMediaId: id }] } });
  if (inUse) throw invalid("This image is in use on a profile.");
  await prisma.mediaAsset.delete({ where: { id } });
  await storage().delete(m.storageKey);
  if (m.thumbKey) await storage().delete(m.thumbKey);
  return { deleted: true };
}

/** Authorizes and streams a media object, with HTTP Range support for video seeking. */
export async function serveMedia(ctx: RequestContext, id: string, variant: string | null, rangeHeader: string | null): Promise<Response> {
  const ws = ctx.workspace.id;
  const m = await prisma.mediaAsset.findFirst({
    where: { workspaceId: ws, id },
    include: {
      postLinks: { include: { post: { include: { author: { select: userSelect } } } } },
      messageLinks: { include: { message: { select: { conversationId: true, createdAt: true } } } },
    },
  });
  if (!m) throw notFound("That file");
  let cache = "private, max-age=86400";
  const g = await loadViewerGraph(prisma, ctx);
  if (m.messageLinks.length) {
    const link = m.messageLinks[0];
    const p = await prisma.participant.findUnique({ where: { conversationId_userId: { conversationId: link.message.conversationId, userId: ctx.actor.id } } });
    if (!p || p.leftAt || (p.hiddenBefore && link.message.createdAt <= p.hiddenBefore)) throw notFound("That file");
    cache = "private, no-store";
  } else if (m.postLinks.length) {
    const post = m.postLinks[0].post;
    if (postAccess(g, post) !== "ok") throw notFound("That file");
    if (post.author.isProtected) cache = "private, no-store";
  } else if (m.scope === "CARD") {
    // Link-card images are re-encoded copies of public web images; visible within the workspace.
  } else if (m.scope === "PROFILE" || m.scope === "LIST" || m.scope === "MOMENT") {
    // Profile/list/moment images are visible within the workspace, except across blocks.
    if (m.ownerId !== ctx.actor.id && authorAccess(g, { id: m.ownerId, isProtected: false, suspended: false }) === "blocked_by") throw notFound("That file");
  } else if (m.ownerId !== ctx.actor.id) {
    throw notFound("That file");
  }
  const key = (variant === "thumb" || variant === "still") && m.thumbKey ? m.thumbKey : m.storageKey;
  const mime = key === m.storageKey ? m.mime : "image/jpeg";
  const obj = await storage().get(key);
  if (!obj) throw new AppError("GONE", "This file is no longer available.");
  const headers = new Headers({
    "content-type": mime,
    "cache-control": cache,
    "accept-ranges": "bytes",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
    "content-disposition": "inline",
  });
  const range = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? parseInt(range[1], 10) : obj.size - parseInt(range[2], 10);
    let end = range[1] && range[2] ? parseInt(range[2], 10) : obj.size - 1;
    start = Math.max(0, start);
    end = Math.min(obj.size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "content-range": `bytes */${obj.size}` } });
    headers.set("content-range", `bytes ${start}-${end}/${obj.size}`);
    headers.set("content-length", String(end - start + 1));
    return new Response(obj.stream({ start, end }), { status: 206, headers });
  }
  headers.set("content-length", String(obj.size));
  return new Response(obj.stream(), { status: 200, headers });
}

/** The bundled GIF collection, labelled as such (no external GIF provider configured). */
export const BUNDLED_GIFS = [
  { file: "bounce.gif", title: "Bouncing ball", alt: "Animated blue ball bouncing with a soft shadow." },
  { file: "clap.gif", title: "Great job!", alt: "Animated yellow star pulsing with the words Great job!" },
  { file: "spinner.gif", title: "Spinner", alt: "Animated green plus sign spinning." },
  { file: "thinking.gif", title: "Studying…", alt: "Animated purple text reading Studying with dots appearing." },
];

/** Copies a bundled GIF into the viewer's uploads so it can be attached like any upload. */
export async function pickBundledGif(ctx: RequestContext, file: string, scope: "POST" | "MESSAGE") {
  const g = BUNDLED_GIFS.find((x) => x.file === file);
  if (!g) throw notFound("That GIF");
  const obj = await storage().get(`seed/gifs/${g.file}`);
  if (!obj) throw new AppError("GONE", "That GIF is missing from this build.");
  const row = await prisma.mediaAsset.create({
    data: { workspaceId: ctx.workspace.id, ownerId: ctx.actor.id, kind: "GIF", scope, mime: "image/gif", storageKey: `seed/gifs/${g.file}`, width: 320, height: 240, bytes: 0, alt: g.alt },
  });
  return toMediaDTO(row);
}
