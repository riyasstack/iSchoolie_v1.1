/**
 * Search query language (documented subset of the legacy advanced search):
 *   word word        all words (AND)
 *   "exact phrase"   phrase
 *   a OR b           any of these words
 *   -word            exclude word
 *   #tag             hashtag
 *   from:handle      posts by an account
 *   to:handle        replies to an account
 *   @handle          posts mentioning an account
 *   since:YYYY-MM-DD / until:YYYY-MM-DD   date range (until is exclusive)
 *   filter:media | filter:images | filter:videos | filter:links | filter:replies
 *   -filter:replies  exclude replies
 *   min_faves:N / min_replies:N / min_reposts:N
 *   lang:xx
 */
export interface ParsedQuery {
  all: string[];
  phrases: string[];
  any: string[];
  none: string[];
  hashtags: string[];
  from: string[];
  to: string[];
  mentions: string[];
  since: string | null;
  until: string | null;
  filters: Set<"media" | "images" | "videos" | "links" | "replies">;
  excludeReplies: boolean;
  minFaves: number;
  minReplies: number;
  minReposts: number;
  lang: string | null;
}

export function parseSearchQuery(q: string): ParsedQuery {
  const out: ParsedQuery = {
    all: [], phrases: [], any: [], none: [], hashtags: [], from: [], to: [], mentions: [],
    since: null, until: null, filters: new Set(), excludeReplies: false, minFaves: 0, minReplies: 0, minReposts: 0, lang: null,
  };
  const tokens: string[] = [];
  const re = /-?"[^"]*"|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) tokens.push(m[0]);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const lower = t.toLowerCase();
    if (tokens[i + 1] === "OR" && tokens[i + 2]) {
      // a OR b OR c
      const group = [t];
      while (tokens[i + 1] === "OR" && tokens[i + 2]) {
        group.push(tokens[i + 2]);
        i += 2;
      }
      out.any.push(...group.map((g) => g.replace(/^"|"$/g, "").toLowerCase()));
      continue;
    }
    if (t.startsWith('"') && t.endsWith('"') && t.length > 1) {
      const p = t.slice(1, -1).trim().toLowerCase();
      if (p) out.phrases.push(p);
    } else if (t.startsWith('-"')) {
      out.none.push(t.slice(2, -1).toLowerCase());
    } else if (lower === "-filter:replies") out.excludeReplies = true;
    else if (lower.startsWith("filter:")) {
      const f = lower.slice(7);
      if (f === "media" || f === "images" || f === "videos" || f === "links" || f === "replies") out.filters.add(f);
    } else if (lower.startsWith("from:")) out.from.push(lower.slice(5).replace(/^@/, ""));
    else if (lower.startsWith("to:")) out.to.push(lower.slice(3).replace(/^@/, ""));
    else if (lower.startsWith("since:") && /^\d{4}-\d{2}-\d{2}$/.test(lower.slice(6))) out.since = lower.slice(6);
    else if (lower.startsWith("until:") && /^\d{4}-\d{2}-\d{2}$/.test(lower.slice(6))) out.until = lower.slice(6);
    else if (lower.startsWith("min_faves:")) out.minFaves = parseInt(lower.slice(10), 10) || 0;
    else if (lower.startsWith("min_replies:")) out.minReplies = parseInt(lower.slice(12), 10) || 0;
    else if (lower.startsWith("min_reposts:") || lower.startsWith("min_retweets:")) out.minReposts = parseInt(lower.split(":")[1], 10) || 0;
    else if (lower.startsWith("lang:")) out.lang = lower.slice(5) || null;
    else if (lower.startsWith("-") && lower.length > 1) out.none.push(lower.slice(1));
    else if (lower.startsWith("#") && lower.length > 1) out.hashtags.push(lower.slice(1));
    else if (lower.startsWith("@") && lower.length > 1) out.mentions.push(lower.slice(1));
    else if (lower !== "or") out.all.push(lower);
  }
  return out;
}

export interface AdvancedFields {
  allWords: string;
  phrase: string;
  anyWords: string;
  noneWords: string;
  hashtags: string;
  from: string;
  to: string;
  mentioning: string;
  since: string;
  until: string;
  minFaves: string;
  minReplies: string;
  minReposts: string;
  replies: "include" | "only" | "exclude";
  links: boolean;
  media: "any" | "media" | "images" | "videos";
  lang: string;
}

export function buildQueryFromAdvanced(f: AdvancedFields): string {
  const parts: string[] = [];
  const words = (s: string) => s.split(/\s+/).map((w) => w.trim()).filter(Boolean);
  parts.push(...words(f.allWords));
  if (f.phrase.trim()) parts.push(`"${f.phrase.trim().replace(/"/g, "")}"`);
  const any = words(f.anyWords);
  if (any.length === 1) parts.push(any[0]);
  else if (any.length > 1) parts.push(any.join(" OR "));
  parts.push(...words(f.noneWords).map((w) => `-${w}`));
  parts.push(...words(f.hashtags).map((h) => (h.startsWith("#") ? h : `#${h}`)));
  parts.push(...words(f.from).map((h) => `from:${h.replace(/^@/, "")}`));
  parts.push(...words(f.to).map((h) => `to:${h.replace(/^@/, "")}`));
  parts.push(...words(f.mentioning).map((h) => `@${h.replace(/^@/, "")}`));
  if (f.since) parts.push(`since:${f.since}`);
  if (f.until) parts.push(`until:${f.until}`);
  if (f.minFaves) parts.push(`min_faves:${parseInt(f.minFaves, 10) || 0}`);
  if (f.minReplies) parts.push(`min_replies:${parseInt(f.minReplies, 10) || 0}`);
  if (f.minReposts) parts.push(`min_reposts:${parseInt(f.minReposts, 10) || 0}`);
  if (f.replies === "only") parts.push("filter:replies");
  if (f.replies === "exclude") parts.push("-filter:replies");
  if (f.links) parts.push("filter:links");
  if (f.media !== "any") parts.push(`filter:${f.media}`);
  if (f.lang) parts.push(`lang:${f.lang}`);
  return parts.join(" ").trim();
}
