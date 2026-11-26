/** Seeds a throwaway demo workspace, prints row counts, verifies invariants, then deletes it. */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { seedWorkspace } from "../src/server/seed/seeder";
import { SEED_VERSION } from "../src/server/seed/fixtures";
import { deleteWorkspace } from "../src/server/services/workspace";

async function main() {
  const t0 = Date.now();
  const ws = await prisma.demoWorkspace.create({ data: { kind: "DEMO", seedVersion: SEED_VERSION, expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.$transaction((tx) => seedWorkspace(tx, ws.id), { timeout: 60_000 });
  const ms = Date.now() - t0;
  const w = { workspaceId: ws.id };
  const counts = {
    users: await prisma.user.count({ where: w }),
    posts: await prisma.post.count({ where: w }),
    deletedPosts: await prisma.post.count({ where: { ...w, deletedAt: { not: null } } }),
    media: await prisma.mediaAsset.count({ where: w }),
    likes: await prisma.like.count({ where: w }),
    reposts: await prisma.repost.count({ where: w }),
    polls: await prisma.poll.count({ where: w }),
    votes: await prisma.pollVote.count({ where: w }),
    follows: await prisma.follow.count({ where: w }),
    requests: await prisma.followRequest.count({ where: w }),
    conversations: await prisma.conversation.count({ where: w }),
    messages: await prisma.message.count({ where: w }),
    notifications: await prisma.notification.count({ where: w }),
    lists: await prisma.list.count({ where: w }),
    topics: await prisma.topic.count({ where: w }),
    moments: await prisma.moment.count({ where: w }),
    bookmarks: await prisma.bookmark.count({ where: w }),
    scheduled: await prisma.scheduledPost.count({ where: w }),
  };
  console.log(JSON.stringify({ seededInMs: ms, ...counts }, null, 1));
  const fail: string[] = [];
  if (counts.users < 20) fail.push("users < 20");
  if (counts.posts < 100) fail.push("posts < 100");
  if (!counts.deletedPosts) fail.push("no deleted post");
  if (counts.polls < 2) fail.push("polls < 2");
  await deleteWorkspace(ws.id);
  const left = await prisma.post.count({ where: w });
  if (left) fail.push("cleanup left rows");
  await prisma.$disconnect();
  if (fail.length) {
    console.error("FAILED:", fail.join(", "));
    process.exit(1);
  }
  console.log("seed check OK (workspace deleted)");
}
main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
