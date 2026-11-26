/**
 * Shared client/server text rules.
 *
 * Character counting uses the official twitter-text library (Apache-2.0) with its
 * v3 weighted configuration: most Latin text counts 1 per code point, CJK and emoji
 * sequences count 2, and every URL counts as a fixed 23 characters. This is the
 * legacy 280-weighted-character rule; we never rely on JavaScript `string.length`.
 */
import twitterText from "twitter-text";

export const POST_MAX = 280;
export const DM_MAX = 10000;
export const BIO_MAX = 160;
export const NAME_MAX = 50;
export const LOCATION_MAX = 30;
export const WEBSITE_MAX = 100;
export const HANDLE_MAX = 15;
export const LIST_NAME_MAX = 25;
export const LIST_DESC_MAX = 100;
export const ALT_MAX = 1000;
export const POLL_CHOICE_MAX = 25;
export const MOMENT_TITLE_MAX = 75;
export const MOMENT_DESC_MAX = 250;
export const MUTED_WORD_MAX = 100;

export interface ParsedText {
  weightedLength: number;
  remaining: number;
  valid: boolean;
  empty: boolean;
  /** 0..1 progress for the circular counter */
  progress: number;
}

export function parsePostText(text: string): ParsedText {
  const parsed = twitterText.parseTweet(text);
  const weightedLength = parsed.weightedLength;
  const trimmedEmpty = text.trim().length === 0;
  return {
    weightedLength,
    remaining: POST_MAX - weightedLength,
    valid: parsed.valid || (trimmedEmpty && weightedLength === 0),
    empty: trimmedEmpty,
    progress: Math.min(1, weightedLength / POST_MAX),
  };
}

/** Normalises line endings and strips control characters except newlines/tabs. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
     
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .normalize("NFC");
}

export type Entity =
  | { type: "text"; text: string }
  | { type: "mention"; text: string; handle: string }
  | { type: "hashtag"; text: string; tag: string }
  | { type: "cashtag"; text: string; tag: string }
  | { type: "url"; text: string; href: string; display: string };

/** Splits text into renderable entities. Only http(s) URLs become links. */
export function extractEntities(text: string): Entity[] {
  const raw = (twitterText.extractEntitiesWithIndices as (t: string, o?: object) => ReturnType<typeof twitterText.extractEntitiesWithIndices>)(text, { extractUrlsWithoutProtocol: true });
  const out: Entity[] = [];
  let cursor = 0;
  for (const e of raw) {
    const [start, end] = e.indices;
    if (start < cursor) continue;
    if (start > cursor) out.push({ type: "text", text: text.slice(cursor, start) });
    const slice = text.slice(start, end);
    if ("screenName" in e && e.screenName) {
      out.push({ type: "mention", text: slice, handle: e.screenName });
    } else if ("hashtag" in e && e.hashtag) {
      out.push({ type: "hashtag", text: slice, tag: e.hashtag });
    } else if ("cashtag" in e && e.cashtag) {
      out.push({ type: "cashtag", text: slice, tag: e.cashtag });
    } else if ("url" in e && e.url) {
      const href = safeHref(e.url);
      if (href) out.push({ type: "url", text: slice, href, display: displayUrl(href) });
      else out.push({ type: "text", text: slice });
    } else {
      out.push({ type: "text", text: slice });
    }
    cursor = end;
  }
  if (cursor < text.length) out.push({ type: "text", text: text.slice(cursor) });
  return out;
}

export function safeHref(url: string): string | null {
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function displayUrl(href: string): string {
  const s = href.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  return s.length > 26 ? `${s.slice(0, 25)}…` : s;
}

export function extractMentions(text: string): string[] {
  return Array.from(new Set(twitterText.extractMentions(text).map((m) => m.toLowerCase())));
}

export function extractHashtags(text: string): string[] {
  return Array.from(new Set(twitterText.extractHashtags(text).map((h) => h.toLowerCase())));
}

/** Handles: 4–15 chars, letters/digits/underscore, not reserved. */
export const HANDLE_RE = /^[A-Za-z0-9_]{4,15}$/;

/** First path segments the application owns; profiles can never use these. */
export const RESERVED_HANDLES = new Set(
  [
    "home", "explore", "search", "search-advanced", "compose", "notifications", "messages", "i",
    "settings", "help", "api", "login", "logout", "signup", "signin", "about", "tos", "privacy",
    "hashtag", "intent", "share", "account", "admin", "static", "_next", "favicon.ico", "brand",
    "seed", "media", "status", "lists", "topics", "moments", "bookmarks", "connect", "offline",
    "support", "root", "ischoolie", "null", "undefined", "follower_requests", "display",
    "keyboard_shortcuts", "robots.txt", "sitemap.xml", "manifest.webmanifest", "icon.png", "apple-icon.png",
  ].map((s) => s.toLowerCase()),
);

export function validateHandle(handle: string): string | null {
  if (!HANDLE_RE.test(handle)) return "Use 4–15 letters, numbers, or underscores.";
  if (RESERVED_HANDLES.has(handle.toLowerCase())) return "That username is reserved.";
  return null;
}

/** Grapheme-aware length for plain fields (names, bios), not posts. */
export function graphemeLength(text: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(text)).length;
  }
  return Array.from(text).length;
}

/** Case-insensitive whole-phrase match used by muted words. */
export function matchesMutedPhrase(textLower: string, phraseLower: string): boolean {
  if (!phraseLower) return false;
  if (phraseLower.startsWith("#") || phraseLower.startsWith("@")) return textLower.includes(phraseLower);
  const escaped = phraseLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, "u").test(textLower);
}

/** Detects predominantly right-to-left text for `dir` attributes. */
export function textDirection(text: string): "rtl" | "ltr" | "auto" {
  const rtl = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
  const ltr = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;
  const first = text.match(new RegExp(`${rtl.source}|${ltr.source}`));
  if (!first) return "auto";
  return rtl.test(first[0]) ? "rtl" : "ltr";
}
