/**
 * Sends a direct message as a seeded account from outside the browser (used by the
 * realtime browser test). Usage: tsx tests/e2e/helpers/send-as.ts <workspaceId> <conversationId> <handle> <text>
 */
import "dotenv/config";
import { prisma } from "../../../src/server/db";
import { sendMessage } from "../../../src/server/services/messages";

async function main() {
  const [workspaceId, conversationId, handle, text] = process.argv.slice(2);
  const u = await prisma.user.findUniqueOrThrow({ where: { workspaceId_handleLower: { workspaceId, handleLower: handle.toLowerCase() } } });
  await sendMessage(
    { mode: "demo", actor: { id: u.id, handle: u.handle }, workspace: { id: workspaceId, kind: "DEMO", createdAt: new Date(), expiresAt: null }, capabilities: { switchActor: false, resetWorkspace: false } },
    conversationId,
    { text, mediaIds: [], sharedPostId: null, clientKey: `e2e${Date.now()}${Math.random().toString(36).slice(2, 8)}` },
  );
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
