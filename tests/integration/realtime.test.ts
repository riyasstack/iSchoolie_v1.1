import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { hub, type RealtimeEvent } from "@/server/realtime";
import * as M from "@/server/services/messages";
import * as P from "@/server/services/posts";
import { deleteWorkspace } from "@/server/services/workspace";
import { ctxFor, key, newWorkspace, postId } from "./helpers";

let ws: string;
beforeAll(async () => {
  ws = await newWorkspace();
});
afterAll(async () => {
  await deleteWorkspace(ws);
  await prisma.$disconnect();
});

function nextEvent(userId: string, match: (e: RealtimeEvent) => boolean, timeoutMs = 5000) {
  return new Promise<RealtimeEvent>((resolve, reject) => {
    const t = setTimeout(() => {
      off();
      reject(new Error("no realtime event"));
    }, timeoutMs);
    const off = hub.subscribe(userId, (e) => {
      if (!match(e)) return;
      clearTimeout(t);
      off();
      resolve(e);
    });
  });
}

describe("realtime fan-out (LISTEN/NOTIFY)", () => {
  it("delivers message events to other participants, ids only, after commit", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const prof = await ctxFor(ws, "prof_lindqvist");
    const conv = await M.startConversation(maya, ["prof_lindqvist"]);
    await hub.ensure();
    const got = nextEvent(prof.actor.id, (e) => e.type === "message");
    await M.sendMessage(maya, conv.id, { text: "realtime hello", mediaIds: [], sharedPostId: null, clientKey: key() });
    const e = await got;
    expect(e).toMatchObject({ type: "message", ws, conversationId: conv.id });
    expect(JSON.stringify(e)).not.toContain("realtime hello");
  });

  it("delivers notification events only when a notification is actually created", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const omar = await ctxFor(ws, "omar_runs");
    const id = await postId(ws, "Joined iSchoolie to keep up");
    await hub.ensure();
    const got = nextEvent(maya.actor.id, (e) => e.type === "notification");
    await P.setLike(omar, id, true);
    await expect(got).resolves.toMatchObject({ type: "notification", ws });
    // Repeating the like hits the dedupe key: no new event.
    const none = nextEvent(maya.actor.id, (e) => e.type === "notification", 1500);
    await P.setLike(omar, id, true);
    await expect(none).rejects.toThrow("no realtime event");
  });
});
