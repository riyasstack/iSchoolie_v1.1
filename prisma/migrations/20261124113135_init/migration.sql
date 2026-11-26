-- CreateEnum
CREATE TYPE "WorkspaceKind" AS ENUM ('DEMO', 'LIVE');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('DEFAULT', 'DIM', 'LIGHTS_OUT');

-- CreateEnum
CREATE TYPE "ReplyAudience" AS ENUM ('EVERYONE', 'FOLLOWING', 'MENTIONED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'GIF', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MediaScope" AS ENUM ('POST', 'MESSAGE', 'PROFILE', 'LIST', 'MOMENT');

-- CreateEnum
CREATE TYPE "DmPolicy" AS ENUM ('EVERYONE', 'FOLLOWING');

-- CreateEnum
CREATE TYPE "ConversationKind" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ACCEPTED', 'REQUEST');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LIKE', 'REPOST', 'REPLY', 'MENTION', 'QUOTE', 'FOLLOW', 'FOLLOW_REQUEST', 'FOLLOW_ACCEPTED', 'SUBSCRIBED_POST');

-- CreateEnum
CREATE TYPE "ScheduledStatus" AS ENUM ('PENDING', 'PUBLISHED', 'CANCELED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportTarget" AS ENUM ('POST', 'USER', 'MESSAGE', 'LIST');

-- CreateTable
CREATE TABLE "DemoWorkspace" (
    "id" TEXT NOT NULL,
    "kind" "WorkspaceKind" NOT NULL DEFAULT 'DEMO',
    "seedVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "DemoWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoSession" (
    "tokenHash" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoSession_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "handleLower" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "avatarMediaId" TEXT,
    "bannerMediaId" TEXT,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "demoTeamBadge" BOOLEAN NOT NULL DEFAULT false,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "isSeedActor" BOOLEAN NOT NULL DEFAULT true,
    "dmPolicy" "DmPolicy" NOT NULL DEFAULT 'EVERYONE',
    "pinnedPostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Preferences" (
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "theme" "Theme" NOT NULL DEFAULT 'DEFAULT',
    "accent" TEXT NOT NULL DEFAULT 'brand',
    "fontScale" INTEGER NOT NULL DEFAULT 100,
    "reducedMotion" BOOLEAN NOT NULL DEFAULT false,
    "autoplay" BOOLEAN NOT NULL DEFAULT true,
    "dataSaver" BOOLEAN NOT NULL DEFAULT false,
    "showSensitiveMedia" BOOLEAN NOT NULL DEFAULT false,
    "altTextReminder" BOOLEAN NOT NULL DEFAULT false,
    "timelineMode" TEXT NOT NULL DEFAULT 'home',
    "notifyLikes" BOOLEAN NOT NULL DEFAULT true,
    "notifyReposts" BOOLEAN NOT NULL DEFAULT true,
    "notifyReplies" BOOLEAN NOT NULL DEFAULT true,
    "notifyMentions" BOOLEAN NOT NULL DEFAULT true,
    "notifyFollows" BOOLEAN NOT NULL DEFAULT true,
    "notifyQuotes" BOOLEAN NOT NULL DEFAULT true,
    "filterNotFollowing" BOOLEAN NOT NULL DEFAULT false,
    "filterNoAvatar" BOOLEAN NOT NULL DEFAULT false,
    "showReadReceipts" BOOLEAN NOT NULL DEFAULT true,
    "searchHideSensitive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Follow" (
    "workspaceId" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followeeId" TEXT NOT NULL,
    "notify" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("followerId","followeeId")
);

-- CreateTable
CREATE TABLE "FollowRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "workspaceId" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "Mute" (
    "workspaceId" TEXT NOT NULL,
    "muterId" TEXT NOT NULL,
    "mutedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mute_pkey" PRIMARY KEY ("muterId","mutedId")
);

-- CreateTable
CREATE TABLE "MutedWord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "phraseLower" TEXT NOT NULL,
    "inHome" BOOLEAN NOT NULL DEFAULT true,
    "inNotifications" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutedWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "textLower" TEXT NOT NULL,
    "hashtags" TEXT[],
    "lang" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "replyToId" TEXT,
    "conversationId" TEXT,
    "quotedPostId" TEXT,
    "replyAudience" "ReplyAudience" NOT NULL DEFAULT 'EVERYONE',
    "clientKey" TEXT,
    "publicationKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mention" (
    "workspaceId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateTable
CREATE TABLE "Like" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateTable
CREATE TABLE "Repost" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repost_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "scope" "MediaScope" NOT NULL,
    "mime" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "alt" TEXT NOT NULL DEFAULT '',
    "status" "MediaStatus" NOT NULL DEFAULT 'READY',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostMedia" (
    "workspaceId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "PostMedia_pkey" PRIMARY KEY ("postId","mediaId")
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollOption" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollVote" (
    "workspaceId" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("pollId","userId")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateTable
CREATE TABLE "List" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "bannerMediaId" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "List_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListMember" (
    "workspaceId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListMember_pkey" PRIMARY KEY ("listId","userId")
);

-- CreateTable
CREATE TABLE "ListSubscription" (
    "workspaceId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListSubscription_pkey" PRIMARY KEY ("listId","userId")
);

-- CreateTable
CREATE TABLE "ListPin" (
    "workspaceId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListPin_pkey" PRIMARY KEY ("listId","userId")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "keywords" TEXT[],

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicFollow" (
    "workspaceId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicFollow_pkey" PRIMARY KEY ("topicId","userId")
);

-- CreateTable
CREATE TABLE "Moment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "coverMediaId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Moment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MomentItem" (
    "workspaceId" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "MomentItem_pkey" PRIMARY KEY ("momentId","postId")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "ConversationKind" NOT NULL,
    "name" TEXT,
    "directKey" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'MEMBER',
    "status" "ParticipantStatus" NOT NULL DEFAULT 'ACCEPTED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "hiddenBefore" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "draft" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
    "text" TEXT NOT NULL DEFAULT '',
    "sharedPostId" TEXT,
    "clientKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageAttachment" (
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("messageId","mediaId")
);

-- CreateTable
CREATE TABLE "MessageHidden" (
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "MessageHidden_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateTable
CREATE TABLE "MessageReaction" (
    "workspaceId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "postId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiddenReply" (
    "workspaceId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "hiddenById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenReply_pkey" PRIMARY KEY ("postId")
);

-- CreateTable
CREATE TABLE "ConversationMute" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rootPostId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMute_pkey" PRIMARY KEY ("userId","rootPostId")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecentSearch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledPost" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "ScheduledStatus" NOT NULL DEFAULT 'PENDING',
    "publishedPostId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "uniqueKey" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'received',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("workspaceId","key")
);

-- CreateIndex
CREATE INDEX "DemoWorkspace_kind_expiresAt_idx" ON "DemoWorkspace"("kind", "expiresAt");

-- CreateIndex
CREATE INDEX "DemoSession_workspaceId_idx" ON "DemoSession"("workspaceId");

-- CreateIndex
CREATE INDEX "DemoSession_expiresAt_idx" ON "DemoSession"("expiresAt");

-- CreateIndex
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

-- CreateIndex
CREATE INDEX "User_workspaceId_displayName_idx" ON "User"("workspaceId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "User_workspaceId_id_key" ON "User"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "User_workspaceId_handleLower_key" ON "User"("workspaceId", "handleLower");

-- CreateIndex
CREATE UNIQUE INDEX "Preferences_workspaceId_userId_key" ON "Preferences"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "Follow_workspaceId_followeeId_idx" ON "Follow"("workspaceId", "followeeId");

-- CreateIndex
CREATE INDEX "FollowRequest_workspaceId_targetId_idx" ON "FollowRequest"("workspaceId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "FollowRequest_requesterId_targetId_key" ON "FollowRequest"("requesterId", "targetId");

-- CreateIndex
CREATE INDEX "Block_workspaceId_blockedId_idx" ON "Block"("workspaceId", "blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "MutedWord_userId_phraseLower_key" ON "MutedWord"("userId", "phraseLower");

-- CreateIndex
CREATE UNIQUE INDEX "Post_publicationKey_key" ON "Post"("publicationKey");

-- CreateIndex
CREATE INDEX "Post_workspaceId_createdAt_idx" ON "Post"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_workspaceId_authorId_createdAt_idx" ON "Post"("workspaceId", "authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_workspaceId_replyToId_idx" ON "Post"("workspaceId", "replyToId");

-- CreateIndex
CREATE INDEX "Post_workspaceId_conversationId_idx" ON "Post"("workspaceId", "conversationId");

-- CreateIndex
CREATE INDEX "Post_workspaceId_quotedPostId_idx" ON "Post"("workspaceId", "quotedPostId");

-- CreateIndex
CREATE UNIQUE INDEX "Post_workspaceId_id_key" ON "Post"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Post_authorId_clientKey_key" ON "Post"("authorId", "clientKey");

-- CreateIndex
CREATE INDEX "Mention_workspaceId_userId_idx" ON "Mention"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "Like_workspaceId_postId_idx" ON "Like"("workspaceId", "postId");

-- CreateIndex
CREATE INDEX "Like_workspaceId_userId_createdAt_idx" ON "Like"("workspaceId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "Repost_workspaceId_postId_idx" ON "Repost"("workspaceId", "postId");

-- CreateIndex
CREATE INDEX "Repost_workspaceId_userId_createdAt_idx" ON "Repost"("workspaceId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "MediaAsset_workspaceId_ownerId_idx" ON "MediaAsset"("workspaceId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_workspaceId_id_key" ON "MediaAsset"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PostMedia_mediaId_key" ON "PostMedia"("mediaId");

-- CreateIndex
CREATE UNIQUE INDEX "Poll_postId_key" ON "Poll"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "Poll_workspaceId_id_key" ON "Poll"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Poll_workspaceId_postId_key" ON "Poll"("workspaceId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "PollOption_workspaceId_id_key" ON "PollOption"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PollOption_pollId_position_key" ON "PollOption"("pollId", "position");

-- CreateIndex
CREATE INDEX "PollVote_optionId_idx" ON "PollVote"("optionId");

-- CreateIndex
CREATE INDEX "Bookmark_workspaceId_userId_createdAt_idx" ON "Bookmark"("workspaceId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "List_workspaceId_ownerId_idx" ON "List"("workspaceId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "List_workspaceId_id_key" ON "List"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "ListMember_workspaceId_userId_idx" ON "ListMember"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "ListSubscription_workspaceId_userId_idx" ON "ListSubscription"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_workspaceId_id_key" ON "Topic"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_workspaceId_slug_key" ON "Topic"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "Moment_workspaceId_ownerId_idx" ON "Moment"("workspaceId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Moment_workspaceId_id_key" ON "Moment"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_lastMessageAt_idx" ON "Conversation"("workspaceId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_workspaceId_id_key" ON "Conversation"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_workspaceId_directKey_key" ON "Conversation"("workspaceId", "directKey");

-- CreateIndex
CREATE INDEX "Participant_workspaceId_userId_idx" ON "Participant"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "Message_workspaceId_conversationId_createdAt_idx" ON "Message"("workspaceId", "conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_workspaceId_id_key" ON "Message"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Message_senderId_clientKey_key" ON "Message"("senderId", "clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "MessageAttachment_mediaId_key" ON "MessageAttachment"("mediaId");

-- CreateIndex
CREATE INDEX "Notification_workspaceId_recipientId_createdAt_idx" ON "Notification"("workspaceId", "recipientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_workspaceId_dedupeKey_key" ON "Notification"("workspaceId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenReply_workspaceId_postId_key" ON "HiddenReply"("workspaceId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedSearch_userId_query_key" ON "SavedSearch"("userId", "query");

-- CreateIndex
CREATE UNIQUE INDEX "RecentSearch_userId_query_key" ON "RecentSearch"("userId", "query");

-- CreateIndex
CREATE INDEX "Draft_workspaceId_userId_updatedAt_idx" ON "Draft"("workspaceId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ScheduledPost_workspaceId_userId_status_idx" ON "ScheduledPost"("workspaceId", "userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Job_uniqueKey_key" ON "Job"("uniqueKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Report_workspaceId_reporterId_idx" ON "Report"("workspaceId", "reporterId");

-- CreateIndex
CREATE INDEX "PostEvent_workspaceId_postId_idx" ON "PostEvent"("workspaceId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "PostEvent_workspaceId_dedupeKey_key" ON "PostEvent"("workspaceId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "DemoSession" ADD CONSTRAINT "DemoSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoSession" ADD CONSTRAINT "DemoSession_workspaceId_actorId_fkey" FOREIGN KEY ("workspaceId", "actorId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preferences" ADD CONSTRAINT "Preferences_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Preferences" ADD CONSTRAINT "Preferences_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_workspaceId_followerId_fkey" FOREIGN KEY ("workspaceId", "followerId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_workspaceId_followeeId_fkey" FOREIGN KEY ("workspaceId", "followeeId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowRequest" ADD CONSTRAINT "FollowRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowRequest" ADD CONSTRAINT "FollowRequest_workspaceId_requesterId_fkey" FOREIGN KEY ("workspaceId", "requesterId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowRequest" ADD CONSTRAINT "FollowRequest_workspaceId_targetId_fkey" FOREIGN KEY ("workspaceId", "targetId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_workspaceId_blockerId_fkey" FOREIGN KEY ("workspaceId", "blockerId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_workspaceId_blockedId_fkey" FOREIGN KEY ("workspaceId", "blockedId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mute" ADD CONSTRAINT "Mute_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mute" ADD CONSTRAINT "Mute_workspaceId_muterId_fkey" FOREIGN KEY ("workspaceId", "muterId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mute" ADD CONSTRAINT "Mute_workspaceId_mutedId_fkey" FOREIGN KEY ("workspaceId", "mutedId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutedWord" ADD CONSTRAINT "MutedWord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MutedWord" ADD CONSTRAINT "MutedWord_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_workspaceId_authorId_fkey" FOREIGN KEY ("workspaceId", "authorId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_workspaceId_replyToId_fkey" FOREIGN KEY ("workspaceId", "replyToId") REFERENCES "Post"("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_workspaceId_quotedPostId_fkey" FOREIGN KEY ("workspaceId", "quotedPostId") REFERENCES "Post"("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_workspaceId_postId_fkey" FOREIGN KEY ("workspaceId", "postId") REFERENCES "Post"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_workspaceId_postId_fkey" FOREIGN KEY ("workspaceId", "postId") REFERENCES "Post"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_workspaceId_postId_fkey" FOREIGN KEY ("workspaceId", "postId") REFERENCES "Post"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_workspaceId_ownerId_fkey" FOREIGN KEY ("workspaceId", "ownerId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_workspaceId_postId_fkey" FOREIGN KEY ("workspaceId", "postId") REFERENCES "Post"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostMedia" ADD CONSTRAINT "PostMedia_workspaceId_mediaId_fkey" FOREIGN KEY ("workspaceId", "mediaId") REFERENCES "MediaAsset"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_workspaceId_postId_fkey" FOREIGN KEY ("workspaceId", "postId") REFERENCES "Post"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_workspaceId_pollId_fkey" FOREIGN KEY ("workspaceId", "pollId") REFERENCES "Poll"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_workspaceId_pollId_fkey" FOREIGN KEY ("workspaceId", "pollId") REFERENCES "Poll"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_workspaceId_optionId_fkey" FOREIGN KEY ("workspaceId", "optionId") REFERENCES "PollOption"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_workspaceId_postId_fkey" FOREIGN KEY ("workspaceId", "postId") REFERENCES "Post"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "List" ADD CONSTRAINT "List_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "List" ADD CONSTRAINT "List_workspaceId_ownerId_fkey" FOREIGN KEY ("workspaceId", "ownerId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListMember" ADD CONSTRAINT "ListMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListMember" ADD CONSTRAINT "ListMember_workspaceId_listId_fkey" FOREIGN KEY ("workspaceId", "listId") REFERENCES "List"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListMember" ADD CONSTRAINT "ListMember_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListSubscription" ADD CONSTRAINT "ListSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListSubscription" ADD CONSTRAINT "ListSubscription_workspaceId_listId_fkey" FOREIGN KEY ("workspaceId", "listId") REFERENCES "List"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListSubscription" ADD CONSTRAINT "ListSubscription_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListPin" ADD CONSTRAINT "ListPin_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListPin" ADD CONSTRAINT "ListPin_workspaceId_listId_fkey" FOREIGN KEY ("workspaceId", "listId") REFERENCES "List"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListPin" ADD CONSTRAINT "ListPin_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicFollow" ADD CONSTRAINT "TopicFollow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicFollow" ADD CONSTRAINT "TopicFollow_workspaceId_topicId_fkey" FOREIGN KEY ("workspaceId", "topicId") REFERENCES "Topic"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicFollow" ADD CONSTRAINT "TopicFollow_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_workspaceId_ownerId_fkey" FOREIGN KEY ("workspaceId", "ownerId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MomentItem" ADD CONSTRAINT "MomentItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MomentItem" ADD CONSTRAINT "MomentItem_workspaceId_momentId_fkey" FOREIGN KEY ("workspaceId", "momentId") REFERENCES "Moment"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MomentItem" ADD CONSTRAINT "MomentItem_workspaceId_postId_fkey" FOREIGN KEY ("workspaceId", "postId") REFERENCES "Post"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_createdById_fkey" FOREIGN KEY ("workspaceId", "createdById") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_workspaceId_conversationId_fkey" FOREIGN KEY ("workspaceId", "conversationId") REFERENCES "Conversation"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_workspaceId_conversationId_fkey" FOREIGN KEY ("workspaceId", "conversationId") REFERENCES "Conversation"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_workspaceId_senderId_fkey" FOREIGN KEY ("workspaceId", "senderId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_workspaceId_sharedPostId_fkey" FOREIGN KEY ("workspaceId", "sharedPostId") REFERENCES "Post"("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_workspaceId_messageId_fkey" FOREIGN KEY ("workspaceId", "messageId") REFERENCES "Message"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_workspaceId_mediaId_fkey" FOREIGN KEY ("workspaceId", "mediaId") REFERENCES "MediaAsset"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageHidden" ADD CONSTRAINT "MessageHidden_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageHidden" ADD CONSTRAINT "MessageHidden_workspaceId_messageId_fkey" FOREIGN KEY ("workspaceId", "messageId") REFERENCES "Message"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageHidden" ADD CONSTRAINT "MessageHidden_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_workspaceId_messageId_fkey" FOREIGN KEY ("workspaceId", "messageId") REFERENCES "Message"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_recipientId_fkey" FOREIGN KEY ("workspaceId", "recipientId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_actorId_fkey" FOREIGN KEY ("workspaceId", "actorId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_postId_fkey" FOREIGN KEY ("workspaceId", "postId") REFERENCES "Post"("workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenReply" ADD CONSTRAINT "HiddenReply_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenReply" ADD CONSTRAINT "HiddenReply_workspaceId_postId_fkey" FOREIGN KEY ("workspaceId", "postId") REFERENCES "Post"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenReply" ADD CONSTRAINT "HiddenReply_workspaceId_hiddenById_fkey" FOREIGN KEY ("workspaceId", "hiddenById") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMute" ADD CONSTRAINT "ConversationMute_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMute" ADD CONSTRAINT "ConversationMute_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMute" ADD CONSTRAINT "ConversationMute_workspaceId_rootPostId_fkey" FOREIGN KEY ("workspaceId", "rootPostId") REFERENCES "Post"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecentSearch" ADD CONSTRAINT "RecentSearch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecentSearch" ADD CONSTRAINT "RecentSearch_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_workspaceId_reporterId_fkey" FOREIGN KEY ("workspaceId", "reporterId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostEvent" ADD CONSTRAINT "PostEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostEvent" ADD CONSTRAINT "PostEvent_workspaceId_postId_fkey" FOREIGN KEY ("workspaceId", "postId") REFERENCES "Post"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostEvent" ADD CONSTRAINT "PostEvent_workspaceId_actorId_fkey" FOREIGN KEY ("workspaceId", "actorId") REFERENCES "User"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DemoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
