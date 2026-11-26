/** Validation shared by client forms and server handlers. */
import { z } from "zod";
import {
  ALT_MAX, BIO_MAX, LIST_DESC_MAX, LIST_NAME_MAX, LOCATION_MAX, MOMENT_DESC_MAX, MOMENT_TITLE_MAX, MUTED_WORD_MAX,
  NAME_MAX, POLL_CHOICE_MAX, WEBSITE_MAX, DM_MAX, graphemeLength, normalizeText, parsePostText, safeHref,
} from "./text";

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "Invalid id");
export const idSchema = id;

export const pollSchema = z.object({
  choices: z
    .array(z.string().transform((s) => normalizeText(s).trim()))
    .min(2, "Polls need at least 2 choices.")
    .max(4, "Polls can have up to 4 choices.")
    .refine((c) => c.every((x) => graphemeLength(x) >= 1 && graphemeLength(x) <= POLL_CHOICE_MAX), `Each choice must be 1–${POLL_CHOICE_MAX} characters.`)
    .refine((c) => new Set(c.map((x) => x.toLowerCase())).size === c.length, "Poll choices must be different."),
  durationMinutes: z.number().int().min(5, "Polls must last at least 5 minutes.").max(7 * 24 * 60, "Polls can last up to 7 days."),
});

export const composeItemSchema = z
  .object({
    text: z.string().max(4000).transform(normalizeText),
    mediaIds: z.array(id).max(4, "Up to 4 attachments.").default([]),
    poll: pollSchema.nullable().default(null),
  })
  .superRefine((item, ctx) => {
    const parsed = parsePostText(item.text);
    if (!parsed.valid && !parsed.empty) ctx.addIssue({ code: "custom", message: `Posts are limited to 280 characters (this one is ${parsed.weightedLength}).`, path: ["text"] });
    if (parsed.empty && item.mediaIds.length === 0 && !item.poll) ctx.addIssue({ code: "custom", message: "Write something or add media.", path: ["text"] });
    if (item.poll && item.mediaIds.length) ctx.addIssue({ code: "custom", message: "Polls can’t be combined with photos, GIFs or videos.", path: ["poll"] });
    if (item.poll && parsed.empty) ctx.addIssue({ code: "custom", message: "Add a question to your poll.", path: ["text"] });
  });

export const replyAudienceSchema = z.enum(["EVERYONE", "FOLLOWING", "MENTIONED"]);

export const composeSchema = z.object({
  items: z.array(composeItemSchema).min(1).max(25, "Threads can have up to 25 posts."),
  replyAudience: replyAudienceSchema.default("EVERYONE"),
  replyToId: id.nullable().default(null),
  quotedPostId: id.nullable().default(null),
});

export const createPostSchema = composeSchema.extend({
  clientKey: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
});

export const draftSchema = z.object({
  payload: z.object({
    items: z.array(z.object({ text: z.string().max(4000), mediaIds: z.array(id).max(4).default([]), poll: z.object({ choices: z.array(z.string().max(100)).max(4), durationMinutes: z.number().int() }).nullable().default(null) })).min(1).max(25),
    replyAudience: replyAudienceSchema.default("EVERYONE"),
    replyToId: id.nullable().default(null),
    quotedPostId: id.nullable().default(null),
  }),
});

export const scheduleSchema = z.object({
  payload: composeSchema,
  scheduledFor: z.string().datetime({ offset: true }),
  timezone: z.string().min(1).max(64).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone."),
});

const optionalUrl = z
  .string()
  .max(WEBSITE_MAX, `Website must be ${WEBSITE_MAX} characters or fewer.`)
  .transform((s) => s.trim())
  .refine((s) => s === "" || !!safeHref(s), "Enter a valid http(s) website address.")
  .transform((s) => (s === "" ? "" : safeHref(s)!));

export const profileSchema = z.object({
  displayName: z
    .string()
    .transform((s) => normalizeText(s).replace(/\n/g, " ").trim())
    .refine((s) => graphemeLength(s) >= 1, "Name can’t be blank.")
    .refine((s) => graphemeLength(s) <= NAME_MAX, `Name must be ${NAME_MAX} characters or fewer.`),
  bio: z.string().transform((s) => normalizeText(s).trim()).refine((s) => graphemeLength(s) <= BIO_MAX, `Bio must be ${BIO_MAX} characters or fewer.`),
  location: z.string().transform((s) => normalizeText(s).replace(/\n/g, " ").trim()).refine((s) => graphemeLength(s) <= LOCATION_MAX, `Location must be ${LOCATION_MAX} characters or fewer.`),
  website: optionalUrl,
  avatarMediaId: id.nullable(),
  bannerMediaId: id.nullable(),
});

export const listSchema = z.object({
  name: z.string().transform((s) => normalizeText(s).replace(/\n/g, " ").trim()).refine((s) => graphemeLength(s) >= 1 && graphemeLength(s) <= LIST_NAME_MAX, `Name must be 1–${LIST_NAME_MAX} characters.`),
  description: z.string().transform((s) => normalizeText(s).trim()).refine((s) => graphemeLength(s) <= LIST_DESC_MAX, `Description must be ${LIST_DESC_MAX} characters or fewer.`),
  isPrivate: z.boolean(),
  bannerMediaId: id.nullable().default(null),
});

export const momentSchema = z.object({
  title: z.string().transform((s) => normalizeText(s).replace(/\n/g, " ").trim()).refine((s) => graphemeLength(s) >= 1 && graphemeLength(s) <= MOMENT_TITLE_MAX, `Title must be 1–${MOMENT_TITLE_MAX} characters.`),
  description: z.string().transform((s) => normalizeText(s).trim()).refine((s) => graphemeLength(s) <= MOMENT_DESC_MAX, `Description must be ${MOMENT_DESC_MAX} characters or fewer.`),
  coverMediaId: id.nullable().default(null),
  postIds: z.array(id).max(100).default([]),
});

export const messageSchema = z.object({
  text: z.string().max(DM_MAX * 2).transform(normalizeText).refine((s) => Array.from(s).length <= DM_MAX, `Messages are limited to ${DM_MAX} characters.`),
  mediaIds: z.array(id).max(1).default([]),
  sharedPostId: id.nullable().default(null),
  clientKey: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
});

export const altSchema = z.object({ alt: z.string().max(ALT_MAX * 2).transform((s) => normalizeText(s).trim()).refine((s) => graphemeLength(s) <= ALT_MAX, `Descriptions are limited to ${ALT_MAX} characters.`) });

export const mutedWordSchema = z.object({
  phrase: z.string().transform((s) => normalizeText(s).replace(/\n/g, " ").trim()).refine((s) => s.length >= 1 && graphemeLength(s) <= MUTED_WORD_MAX, `Enter 1–${MUTED_WORD_MAX} characters.`),
  inHome: z.boolean().default(true),
  inNotifications: z.boolean().default(true),
  durationHours: z.number().int().min(0).max(24 * 30).nullable().default(null),
});

export const reportSchema = z.object({
  targetType: z.enum(["POST", "USER", "MESSAGE", "LIST"]),
  targetId: id,
  category: z.enum(["spam", "abusive", "harassment", "hateful", "self_harm", "violent", "sensitive_media", "impersonation", "private_info", "misleading", "not_interested"]),
  details: z.string().max(1000).default("").transform((s) => normalizeText(s).trim()),
});

export const preferencesSchema = z
  .object({
    theme: z.enum(["DEFAULT", "DIM", "LIGHTS_OUT"]),
    accent: z.enum(["brand", "yellow", "pink", "purple", "orange", "green"]),
    fontScale: z.number().int().min(85).max(125),
    reducedMotion: z.boolean(),
    autoplay: z.boolean(),
    dataSaver: z.boolean(),
    showSensitiveMedia: z.boolean(),
    altTextReminder: z.boolean(),
    timelineMode: z.enum(["home", "latest"]),
    notifyLikes: z.boolean(),
    notifyReposts: z.boolean(),
    notifyReplies: z.boolean(),
    notifyMentions: z.boolean(),
    notifyFollows: z.boolean(),
    notifyQuotes: z.boolean(),
    filterNotFollowing: z.boolean(),
    filterNoAvatar: z.boolean(),
    showReadReceipts: z.boolean(),
    searchHideSensitive: z.boolean(),
  })
  .partial();

export const accountSchema = z.object({
  isProtected: z.boolean().optional(),
  dmPolicy: z.enum(["EVERYONE", "FOLLOWING"]).optional(),
  handle: z.string().optional(),
});
