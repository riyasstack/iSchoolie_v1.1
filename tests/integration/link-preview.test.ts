import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { prisma } from "@/server/db";
import * as P from "@/server/services/posts";
import { fetchAndStorePreview, safeFetch } from "@/server/services/link-preview";
import { serveMedia } from "@/server/services/media";
import { deleteWorkspace } from "@/server/services/workspace";
import { ctxFor, key, newWorkspace } from "./helpers";
import type { PostDTO } from "@/lib/types";

let ws: string;
let server: http.Server;
let base: string;
const png = readFileSync("public/brand/icon-512.png");

beforeAll(async () => {
  ws = await newWorkspace();
  server = http.createServer((req, res) => {
    const u = req.url ?? "/";
    if (u === "/page") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<html><head><title>Fixture</title><meta property="og:title" content="Fixture article"><meta property="og:description" content="A local fixture page"><meta property="og:image" content="/cover.png"><meta property="og:site_name" content="Fixture Site"></head><body>hi</body></html>`);
    } else if (u === "/cover.png") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(png);
    } else if (u.startsWith("/loop")) {
      res.writeHead(302, { location: `/loop${Number(u.slice(5) || 0) + 1}` });
      res.end();
    } else if (u === "/json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    } else if (u === "/big-image") {
      res.writeHead(200, { "content-type": "image/png", "content-length": String(10 * 1024 * 1024) });
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  // A real-looking hostname (twitter-text, like the original, doesn't linkify bare IPs);
  // tests resolve it to the loopback fixture through an explicit override.
  base = `http://fixture.example.com:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await deleteWorkspace(ws);
  await prisma.$disconnect();
});

// Tests reach the loopback fixture only by explicitly widening the address policy.
const allowLoopback = { allowAddress: (a: string) => a === "127.0.0.1", resolve: async () => ["127.0.0.1"] };

describe("link previews", () => {
  it("publishing a post with a link records a pending preview and a worker job", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const url = `${base}/page`;
    await P.createPost(maya, { items: [{ text: `Read this ${url}`, mediaIds: [], poll: null }], replyAudience: "EVERYONE", replyToId: null, quotedPostId: null, clientKey: key() });
    const row = await prisma.linkPreview.findUniqueOrThrow({ where: { workspaceId_url: { workspaceId: ws, url } } });
    expect(row.status).toBe("pending");
    expect(await prisma.job.count({ where: { type: "link_preview", payload: { path: ["url"], equals: url } } })).toBe(1);
  });

  it("the default policy refuses private and loopback targets (SSRF)", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const out = await fetchAndStorePreview(ws, `${base}/page`, maya.actor.id);
    expect(out).toBe("failed");
    const row = await prisma.linkPreview.findUniqueOrThrow({ where: { workspaceId_url: { workspaceId: ws, url: `${base}/page` } } });
    expect(row.error).toMatch(/blocked address|non-default port|ENOTFOUND|EAI_AGAIN/);
    await expect(safeFetch("http://fixture.example.com/page", "text/html", 1000, { resolve: async () => ["127.0.0.1"] })).rejects.toThrow(/blocked address/);
    await expect(safeFetch("http://169.254.169.254/latest/meta-data", "text/html", 1000)).rejects.toThrow(/blocked address/);
    await expect(safeFetch("file:///etc/passwd", "text/html", 1000)).rejects.toThrow(/unsupported protocol/);
    await expect(safeFetch("http://user:pass@example.org/", "text/html", 1000)).rejects.toThrow(/credentials/);
    // DNS rebinding style: any private answer blocks the request.
    await expect(safeFetch("http://rebind.example/", "text/html", 1000, { resolve: async () => ["93.184.216.34", "10.0.0.7"] })).rejects.toThrow(/blocked address/);
  });

  it("fetches, parses and stores a card with a re-encoded image; the card renders on the post", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const url = `${base}/page`;
    await prisma.linkPreview.update({ where: { workspaceId_url: { workspaceId: ws, url } }, data: { status: "pending" } });
    expect(await fetchAndStorePreview(ws, url, maya.actor.id, allowLoopback)).toBe("ok");
    const post = await prisma.post.findFirstOrThrow({ where: { workspaceId: ws, text: { contains: url } } });
    const dto = (await P.getPost(maya, post.id)) as PostDTO;
    expect(dto.card).toMatchObject({ url, title: "Fixture article", description: "A local fixture page", siteName: "Fixture Site" });
    expect(dto.card!.imageUrl).toMatch(/^\/api\/media\//);
    const media = await prisma.mediaAsset.findFirstOrThrow({ where: { workspaceId: ws, scope: "CARD" } });
    expect(media.mime).toBe("image/jpeg");
    const amir = await ctxFor(ws, "amir_codes");
    expect((await serveMedia(amir, media.id, null, null)).status).toBe(200);
  });

  it("rejects redirect loops, non-HTML pages and oversized images", async () => {
    await expect(safeFetch(`${base}/loop0`, "text/html", 1000, allowLoopback)).rejects.toThrow(/too many redirects/);
    const maya = await ctxFor(ws, "maya_learns");
    const jsonUrl = `${base}/json`;
    await prisma.linkPreview.create({ data: { workspaceId: ws, url: jsonUrl } });
    expect(await fetchAndStorePreview(ws, jsonUrl, maya.actor.id, allowLoopback)).toBe("failed");
    expect((await prisma.linkPreview.findUniqueOrThrow({ where: { workspaceId_url: { workspaceId: ws, url: jsonUrl } } })).error).toBe("not html");
    await expect(safeFetch(`${base}/big-image`, "image/png", 3 * 1024 * 1024, allowLoopback)).rejects.toThrow(/too large/);
  });

  it("posts with media, polls or quotes don't get cards", async () => {
    const maya = await ctxFor(ws, "maya_learns");
    const other = await prisma.post.findFirstOrThrow({ where: { workspaceId: ws, deletedAt: null, author: { handle: "prof_lindqvist" } } });
    const [q] = await P.createPost(maya, { items: [{ text: `quote with link ${base}/page`, mediaIds: [], poll: null }], replyAudience: "EVERYONE", replyToId: null, quotedPostId: other.id, clientKey: key() });
    expect(q.card).toBeNull();
  });
});
