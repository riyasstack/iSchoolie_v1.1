/** Data transfer objects shared by the API and the client. */

export type ThemeName = "DEFAULT" | "DIM" | "LIGHTS_OUT";
export type ReplyAudience = "EVERYONE" | "FOLLOWING" | "MENTIONED";

export interface UserDTO {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  isProtected: boolean;
  demoTeamBadge: boolean;
}

export interface RelationshipDTO {
  following: boolean;
  followedBy: boolean;
  requested: boolean;
  incomingRequest: boolean;
  blocking: boolean;
  blockedBy: boolean;
  muting: boolean;
  notify: boolean;
}

export interface ProfileDTO extends UserDTO {
  bio: string;
  location: string;
  website: string;
  bannerUrl: string | null;
  avatarMediaId: string | null;
  bannerMediaId: string | null;
  createdAt: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  likesCount: number;
  mediaCount: number;
  listedCount: number;
  pinnedPostId: string | null;
  isSelf: boolean;
  suspended: boolean;
  /** False when protected (and not an approved follower) or blocked. */
  canViewContent: boolean;
  relationship: RelationshipDTO;
  dmPolicy: "EVERYONE" | "FOLLOWING";
  canMessage: boolean;
}

export interface MediaDTO {
  id: string;
  kind: "IMAGE" | "GIF" | "VIDEO";
  url: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  alt: string;
  status: "PENDING" | "READY" | "FAILED";
  mime: string;
}

export interface PollDTO {
  id: string;
  options: { id: string; label: string; votes: number }[];
  totalVotes: number;
  endsAt: string;
  closed: boolean;
  viewerVoteOptionId: string | null;
  canVote: boolean;
}

export type UnavailableReason = "deleted" | "protected" | "blocked" | "blocked_by" | "suspended" | "not_found" | "muted";

export interface UnavailableDTO {
  id: string;
  unavailable: UnavailableReason;
  authorHandle?: string;
}

export interface PostDTO {
  id: string;
  author: UserDTO;
  text: string;
  createdAt: string;
  lang: string | null;
  sensitive: boolean;
  replyToId: string | null;
  replyingTo: string[];
  conversationId: string;
  media: MediaDTO[];
  poll: PollDTO | null;
  quoted: PostDTO | UnavailableDTO | null;
  counts: { replies: number; reposts: number; quotes: number; likes: number };
  viewer: {
    liked: boolean;
    reposted: boolean;
    bookmarked: boolean;
    isAuthor: boolean;
    canReply: boolean;
    replyRestriction: string | null;
    conversationMuted: boolean;
    /** Viewer authored the conversation root and may hide this reply. */
    canHide: boolean;
    authorMuted: boolean;
    authorFollowed: boolean;
  };
  replyAudience: ReplyAudience;
  pinned: boolean;
  hidden: boolean;
}

export type EntryContext =
  | { type: "repost"; by: UserDTO }
  | { type: "pinned" }
  | { type: "topic"; topic: { slug: string; name: string } }
  | { type: "liked"; by: UserDTO }
  | { type: "follows_reply"; by: UserDTO };

export interface TimelineEntry {
  key: string;
  postId: string;
  context?: EntryContext;
  /** Optional parent shown above a reply as a connected conversation module. */
  parentId?: string;
  sortAt: string;
}

export interface TimelinePage {
  entries: TimelineEntry[];
  posts: PostDTO[];
  nextCursor: string | null;
  /** Ranking note, e.g. for Home: how entries were ordered. */
  note?: string;
}

export interface PostDetailDTO {
  focal: PostDTO | UnavailableDTO;
  ancestors: (PostDTO | UnavailableDTO)[];
  replies: PostDTO[];
  nextCursor: string | null;
  hiddenReplyCount: number;
  posts: PostDTO[];
}

export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
}

export interface UserListItem {
  user: UserDTO;
  bio: string;
  relationship: RelationshipDTO;
  isSelf: boolean;
}

export type NotificationKind =
  | "LIKE" | "REPOST" | "REPLY" | "MENTION" | "QUOTE" | "FOLLOW" | "FOLLOW_REQUEST" | "FOLLOW_ACCEPTED" | "SUBSCRIBED_POST";

export interface NotificationGroupDTO {
  key: string;
  type: NotificationKind;
  actors: UserDTO[];
  actorCount: number;
  postId: string | null;
  post: PostDTO | UnavailableDTO | null;
  createdAt: string;
  unread: boolean;
  ids: string[];
}

export interface ConversationDTO {
  id: string;
  kind: "DIRECT" | "GROUP";
  name: string | null;
  participants: (UserDTO & { role: "ADMIN" | "MEMBER"; active: boolean })[];
  lastMessage: { id: string; text: string; senderId: string; createdAt: string; kind: "TEXT" | "SYSTEM"; hasMedia: boolean } | null;
  unreadCount: number;
  muted: boolean;
  status: "ACCEPTED" | "REQUEST";
  viewerRole: "ADMIN" | "MEMBER";
  viewerActive: boolean;
  draft: string;
  lastMessageAt: string;
  /** Read positions of other participants (only when they allow read receipts). */
  readBy: { userId: string; lastReadAt: string }[];
  canSend: boolean;
  sendRestriction: string | null;
}

export interface MessageDTO {
  id: string;
  clientKey: string;
  conversationId: string;
  sender: UserDTO;
  kind: "TEXT" | "SYSTEM";
  text: string;
  createdAt: string;
  media: MediaDTO[];
  sharedPost: PostDTO | UnavailableDTO | null;
  reactions: { emoji: string; userId: string; handle: string }[];
}

export interface ListDTO {
  id: string;
  name: string;
  description: string;
  isPrivate: boolean;
  bannerUrl: string | null;
  bannerMediaId: string | null;
  owner: UserDTO;
  memberCount: number;
  subscriberCount: number;
  viewer: { isOwner: boolean; subscribed: boolean; pinned: boolean };
  createdAt: string;
}

export interface TopicDTO {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  following: boolean;
  followerCount: number;
}

export interface MomentDTO {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  coverMediaId: string | null;
  owner: UserDTO;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  isOwner: boolean;
}

export interface DraftItemPayload {
  text: string;
  mediaIds: string[];
  poll: { choices: string[]; durationMinutes: number } | null;
}

export interface ComposePayload {
  items: DraftItemPayload[];
  replyAudience: ReplyAudience;
  replyToId: string | null;
  quotedPostId: string | null;
}

export interface DraftDTO {
  id: string;
  payload: ComposePayload;
  media: MediaDTO[];
  updatedAt: string;
}

export interface ScheduledDTO {
  id: string;
  payload: ComposePayload;
  media: MediaDTO[];
  scheduledFor: string;
  timezone: string;
  status: "PENDING" | "PUBLISHED" | "CANCELED" | "FAILED";
  publishedPostId: string | null;
  lastError: string | null;
}

export interface PreferencesDTO {
  theme: ThemeName;
  accent: string;
  fontScale: number;
  reducedMotion: boolean;
  autoplay: boolean;
  dataSaver: boolean;
  showSensitiveMedia: boolean;
  altTextReminder: boolean;
  timelineMode: "home" | "latest";
  notifyLikes: boolean;
  notifyReposts: boolean;
  notifyReplies: boolean;
  notifyMentions: boolean;
  notifyFollows: boolean;
  notifyQuotes: boolean;
  filterNotFollowing: boolean;
  filterNoAvatar: boolean;
  showReadReceipts: boolean;
  searchHideSensitive: boolean;
}

export interface SessionDTO {
  mode: "demo" | "live";
  actor: UserDTO & { isProtected: boolean; dmPolicy: "EVERYONE" | "FOLLOWING" };
  workspace: { id: string; createdAt: string; expiresAt: string | null; retentionDays: number };
  capabilities: { switchActor: boolean; resetWorkspace: boolean };
  preferences: PreferencesDTO;
  badges: { notifications: number; messages: number; followRequests: number };
}

export interface TrendDTO {
  key: string;
  label: string;
  query: string;
  category: string;
  /** "measured" = counted from posts in this workspace; "curated" = editorial demo trend. */
  source: "measured" | "curated";
  postCount: number;
  context: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}
