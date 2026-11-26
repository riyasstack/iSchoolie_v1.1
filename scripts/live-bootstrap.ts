/**
 * Prepares the shared LIVE workspace used when APP_MODE=live.
 *
 *   npm run live:bootstrap              # create the LIVE workspace if missing
 *   npm run live:bootstrap -- --sample  # also add the fictional starter network (once)
 *
 * The starter network is the same clearly-fictional seed the demo uses, so guests have
 * something to browse before real members post. Seed accounts can't be signed in to.
 */
import "dotenv/config";
import { prisma } from "../src/server/db";
import { seedWorkspace } from "../src/server/seed/seeder";
import { SEED_VERSION } from "../src/server/seed/fixtures";

async function main() {
  const sample = process.argv.includes("--sample");
  let ws = await prisma.demoWorkspace.findFirst({ where: { kind: "LIVE" }, orderBy: { createdAt: "asc" } });
  if (!ws) {
    ws = await prisma.demoWorkspace.create({ data: { kind: "LIVE", seedVersion: 0, expiresAt: null } });
    console.log(`Created LIVE workspace ${ws.id}`);
  } else {
    console.log(`LIVE workspace exists: ${ws.id}`);
  }
  if (sample) {
    const seeded = await prisma.user.count({ where: { workspaceId: ws.id, isSeedActor: true } });
    if (seeded > 0) {
      console.log(`Starter content already present (${seeded} fictional accounts); skipping.`);
    } else {
      const id = ws.id;
      await prisma.$transaction((tx) => seedWorkspace(tx, id), { timeout: 120_000, maxWait: 10_000 });
      await prisma.demoWorkspace.update({ where: { id }, data: { seedVersion: SEED_VERSION } });
      const [users, posts] = await Promise.all([
        prisma.user.count({ where: { workspaceId: id } }),
        prisma.post.count({ where: { workspaceId: id } }),
      ]);
      console.log(`Added fictional starter network: ${users} accounts, ${posts} posts.`);
    }
  }
  const members = await prisma.authIdentity.count();
  console.log(`Members with sign-in identities: ${members}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
