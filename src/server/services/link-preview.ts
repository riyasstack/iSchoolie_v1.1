/**
 * Link preview cards.
 *
 * Fetching happens only in the worker (never during a user request) with SSRF guards:
 *  - http/https only, default ports only (80/443), no credentials in URLs
 *  - every DNS answer must be a public unicast address (no loopback, private, link-local,
 *    CGNAT, multicast, reserved, or IPv4-mapped private ranges)
 *  - the socket connects to the vetted address (no second lookup → no DNS rebinding)
 *  - each redirect is re-validated (max 3); 5 s timeout per request
 *  - HTML only, at most 512 KB read; images at most 3 MB, re-encoded with sharp
 * Previews are cached per workspace and URL.
 */
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import type { LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import sharp from "sharp";
import { prisma, type Db } from "../db";
import { storage } from "../storage";
import { log } from "../log";
import { extractEntities } from "@/lib/text";

const HTML_LIMIT = 512 * 1024;
const IMAGE_LIMIT = 3 * 1024 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const UA = "iSchoolieLinkPreview/1.0 (+demo; link previews)";

export class PreviewError extends Error {}

/** Public unicast only. Exported for tests. */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  let addr = ipaddr.parse(address);
  if (addr.kind() === "ipv6" && (addr as ipaddr.IPv6).isIPv4MappedAddress()) addr = (addr as ipaddr.IPv6).toIPv4Address();
  return addr.range() === "unicast";
}

export interface FetchOptions {
  /** Address policy; tests may widen it to reach a local fixture server. */
  allowAddress?: (address: string) => boolean;
  resolve?: (host: string) => Promise<string[]>;
}

async function vet(u: URL, opts: FetchOptions): Promise<string> {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new PreviewError("unsupported protocol");
  if (u.username || u.password) throw new PreviewError("credentials in URL");
  if (u.port && !((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) && !opts.allowAddress) throw new PreviewError("non-default port");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const allow = opts.allowAddress ?? isPublicAddress;
  const addresses = ipaddr.isValid(host) ? [host] : await (opts.resolve ?? (async (h) => (await dns.lookup(h, { all: true, verbatim: true })).map((a) => a.address)))(host);
  if (!addresses.length) throw new PreviewError("no address");
  for (const a of addresses) if (!allow(a)) throw new PreviewError("blocked address");
  return addresses[0];
}

interface Fetched {
  status: number;
  url: URL;
  type: string;
  body: Buffer;
}

function requestOnce(u: URL, address: string, accept: string, limit: number): Promise<Fetched & { location?: string }> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    // Pin the connection to the vetted address while keeping SNI/Host as the hostname.
    const lookup: LookupFunction = (_host, options, cb) => {
      const family = address.includes(":") ? 6 : 4;
      if ((options as { all?: boolean }).all) (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address, family }]);
      else cb(null, address, family);
    };
    const req = lib.request(u, { method: "GET", lookup, headers: { "user-agent": UA, accept, "accept-language": "en" }, timeout: TIMEOUT_MS }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        return resolve({ status, url: u, type: "", body: Buffer.alloc(0), location: res.headers.location });
      }
      const type = String(res.headers["content-type"] ?? "").toLowerCase();
      const declared = Number(res.headers["content-length"] ?? 0);
      if (declared > limit) {
        res.destroy();
        return reject(new PreviewError("response too large"));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > limit) {
          // HTML: keep what we have (metadata lives in <head>); images: reject.
          if (accept.startsWith("text/html")) {
            res.destroy();
            resolve({ status, url: u, type, body: Buffer.concat(chunks) });
          } else {
            res.destroy();
            reject(new PreviewError("response too large"));
          }
          return;
        }
        chunks.push(c);
      });
      res.on("end", () => resolve({ status, url: u, type, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new PreviewError("timeout")));
    req.on("error", reject);
    req.end();
  });
}

export async function safeFetch(raw: string, accept: string, limit: number, opts: FetchOptions = {}): Promise<Fetched> {
  let u = new URL(raw);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const address = await vet(u, opts);
    const r = await requestOnce(u, address, accept, limit);
    if (r.location) {
      u = new URL(r.location, u);
      continue;
    }
    return r;
  }
  throw new PreviewError("too many redirects");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function clean(s: string | undefined, max: number): string | null {
  if (!s) return null;
  const t = decodeEntities(s).replace(/<[^>]*>/g, "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return Array.from(t).length > max ? `${Array.from(t).slice(0, max - 1).join("")}…` : t;
}

/** Extracts Open Graph / Twitter card / fallback metadata from HTML. Exported for tests. */
export function parseMetadata(html: string, base: URL) {
  const head = html.slice(0, HTML_LIMIT);
  const meta: Record<string, string> = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (key && content !== undefined && !(key in meta)) meta[key] = content;
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const imageRaw = meta["og:image:secure_url"] ?? meta["og:image"] ?? meta["twitter:image"];
  let image: string | null = null;
  if (imageRaw) {
    try {
      const iu = new URL(decodeEntities(imageRaw), base);
      if (iu.protocol === "https:" || iu.protocol === "http:") image = iu.toString();
    } catch {
      /* ignore bad image URL */
    }
  }
  return {
    title: clean(meta["og:title"] ?? meta["twitter:title"] ?? titleTag, 120),
    description: clean(meta["og:description"] ?? meta["twitter:description"] ?? meta["description"], 240),
    siteName: clean(meta["og:site_name"], 60) ?? base.hostname.replace(/^www\./, ""),
    image,
  };
}

/** First http(s) link in a post's text (the card candidate). */
export function firstLink(text: string): string | null {
  const e = extractEntities(text).find((x) => x.type === "url");
  return e && e.type === "url" ? e.href : null;
}

/** Records a pending preview and enqueues a worker job (idempotent per workspace + URL). */
export async function requestPreview(db: Db, workspaceId: string, url: string, requestedBy: string) {
  await db.linkPreview.createMany({ data: [{ workspaceId, url }], skipDuplicates: true });
  const key = `preview:${workspaceId}:${Buffer.from(url).toString("base64url").slice(0, 180)}`;
  await db.job.createMany({ data: [{ type: "link_preview", uniqueKey: key, runAt: new Date(), payload: { workspaceId, url, requestedBy } }], skipDuplicates: true });
}

/** Worker handler: fetch, parse, store. Failures are recorded, not retried forever. */
export async function fetchAndStorePreview(workspaceId: string, url: string, requestedBy: string, opts: FetchOptions = {}) {
  const row = await prisma.linkPreview.findUnique({ where: { workspaceId_url: { workspaceId, url } } });
  if (!row || row.status === "ok") return "skipped";
  try {
    const page = await safeFetch(url, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", HTML_LIMIT, opts);
    if (page.status < 200 || page.status >= 300) throw new PreviewError(`http ${page.status}`);
    if (!/text\/html|application\/xhtml\+xml/.test(page.type)) throw new PreviewError("not html");
    const md = parseMetadata(page.body.toString("utf8"), page.url);
    if (!md.title && !md.description) throw new PreviewError("no metadata");
    let imageMediaId: string | null = null;
    if (md.image) {
      try {
        const img = await safeFetch(md.image, "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8", IMAGE_LIMIT, opts);
        if (img.status >= 200 && img.status < 300 && img.type.startsWith("image/")) {
          const out = await sharp(img.body, { limitInputPixels: 40_000_000, failOn: "error" })
            .rotate()
            .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 82 })
            .toBuffer({ resolveWithObject: true });
          const id = crypto.randomUUID().replace(/-/g, "");
          const key = `ws/${workspaceId}/cards/${id}.jpg`;
          await storage().put(key, out.data);
          // Owned by the author whose post triggered the fetch; served to the workspace like any card.
          await prisma.mediaAsset.create({ data: { id, workspaceId, ownerId: requestedBy, kind: "IMAGE", scope: "CARD", mime: "image/jpeg", storageKey: key, width: out.info.width, height: out.info.height, bytes: out.data.length, alt: "" } });
          imageMediaId = id;
        }
      } catch (e) {
        log("info", "link_preview_image_skipped", { reason: e instanceof Error ? e.message : String(e) });
      }
    }
    await prisma.linkPreview.update({
      where: { id: row.id },
      data: { status: "ok", finalUrl: page.url.toString(), title: md.title, description: md.description, siteName: md.siteName, imageMediaId, fetchedAt: new Date(), error: null },
    });
    return "ok";
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await prisma.linkPreview.update({ where: { id: row.id }, data: { status: "failed", error: reason.slice(0, 200), fetchedAt: new Date() } });
    log("info", "link_preview_failed", { reason: reason.slice(0, 120) });
    return "failed";
  }
}
