/**
 * One contract, two adapters: the local filesystem adapter and the S3 adapter talking to
 * a minimal in-process S3-compatible server (path-style; PUT/GET/HEAD/DELETE, Range,
 * ListObjectsV2 with pagination, DeleteObjects). This verifies the adapter's protocol use;
 * it is not a substitute for a run against real AWS S3 / R2 / MinIO.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { localStorage, type StorageAdapter } from "@/server/storage";
import { createS3Storage } from "@/server/storage/s3";

const PAGE = 2; // small page size to exercise ListObjectsV2 pagination
const objects = new Map<string, Buffer>();
let server: http.Server;
let endpoint: string;
const requests: string[] = [];

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

beforeAll(async () => {
  server = http.createServer(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const [, bucket, ...rest] = u.pathname.split("/");
    const key = decodeURIComponent(rest.join("/"));
    requests.push(`${req.method} ${u.pathname}${u.search}`);
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    if (bucket !== "test-bucket") {
      res.writeHead(404).end();
      return;
    }
    if (req.method === "PUT" && key) {
      objects.set(key, body);
      res.writeHead(200, { etag: '"x"' }).end();
    } else if ((req.method === "GET" || req.method === "HEAD") && key) {
      const obj = objects.get(key);
      if (!obj) {
        res.writeHead(404, { "content-type": "application/xml" }).end(req.method === "GET" ? "<Error><Code>NoSuchKey</Code></Error>" : undefined);
        return;
      }
      const m = /bytes=(\d+)-(\d+)/.exec(String(req.headers.range ?? ""));
      if (m) {
        const part = obj.subarray(Number(m[1]), Number(m[2]) + 1);
        res.writeHead(206, { "content-length": part.length, "content-range": `bytes ${m[1]}-${m[2]}/${obj.length}` });
        res.end(req.method === "HEAD" ? undefined : part);
      } else {
        res.writeHead(200, { "content-length": obj.length });
        res.end(req.method === "HEAD" ? undefined : obj);
      }
    } else if (req.method === "DELETE" && key) {
      objects.delete(key);
      res.writeHead(204).end();
    } else if (req.method === "GET" && u.searchParams.get("list-type") === "2") {
      const prefix = u.searchParams.get("prefix") ?? "";
      const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      // Like S3, the continuation token means "continue after this key" (stable under deletes).
      const after = u.searchParams.get("continuation-token");
      const remaining = after ? all.filter((k) => k > Buffer.from(after, "base64url").toString()) : all;
      const page = remaining.slice(0, PAGE);
      const truncated = remaining.length > PAGE;
      const next = truncated ? Buffer.from(page[page.length - 1]).toString("base64url") : "";
      res.writeHead(200, { "content-type": "application/xml" });
      res.end(
        `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>test-bucket</Name><Prefix>${xmlEscape(prefix)}</Prefix><KeyCount>${page.length}</KeyCount><IsTruncated>${truncated}</IsTruncated>${truncated ? `<NextContinuationToken>${next}</NextContinuationToken>` : ""}${page.map((k) => `<Contents><Key>${xmlEscape(k)}</Key><Size>${objects.get(k)!.length}</Size></Contents>`).join("")}</ListBucketResult>`,
      );
    } else if (req.method === "POST" && u.searchParams.has("delete")) {
      for (const m of body.toString().matchAll(/<Key>([^<]+)<\/Key>/g)) objects.delete(m[1].replace(/&lt;/g, "<").replace(/&amp;/g, "&"));
      res.writeHead(200, { "content-type": "application/xml" }).end(`<?xml version="1.0" encoding="UTF-8"?><DeleteResult></DeleteResult>`);
    } else {
      res.writeHead(400).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
});

async function readAll(s: ReadableStream<Uint8Array>) {
  return Buffer.from(await new Response(s).arrayBuffer());
}

const adapters: [string, () => StorageAdapter][] = [
  ["local", () => localStorage],
  ["s3 (S3-compatible test server)", () => createS3Storage({ bucket: "test-bucket", region: "us-east-1", endpoint, forcePathStyle: true, accessKeyId: "test", secretAccessKey: "test", prefix: "app/" }, localStorage)],
];

describe.each(adapters)("storage contract: %s", (_name, make) => {
  const root = `ws/contract-${Math.random().toString(36).slice(2, 8)}`;

  it("puts, reads whole objects and byte ranges, and reports missing keys", async () => {
    const s = make();
    const data = Buffer.from("0123456789abcdef");
    await s.put(`${root}/a.bin`, data);
    const obj = await s.get(`${root}/a.bin`);
    expect(obj?.size).toBe(16);
    expect((await readAll(obj!.stream())).toString()).toBe("0123456789abcdef");
    expect((await readAll(obj!.stream({ start: 4, end: 7 }))).toString()).toBe("4567");
    expect(await s.get(`${root}/missing.bin`)).toBeNull();
  });

  it("deletes single objects and whole prefixes (across list pages)", async () => {
    const s = make();
    for (let i = 0; i < 5; i++) await s.put(`${root}/p/${i}.bin`, Buffer.from(String(i)));
    await s.put(`${root}/keep.bin`, Buffer.from("k"));
    await s.delete(`${root}/a.bin`);
    expect(await s.get(`${root}/a.bin`)).toBeNull();
    await s.deletePrefix(`${root}/p`);
    for (let i = 0; i < 5; i++) expect(await s.get(`${root}/p/${i}.bin`)).toBeNull();
    expect(await s.get(`${root}/keep.bin`)).not.toBeNull();
    await s.deletePrefix(root);
    expect(await s.get(`${root}/keep.bin`)).toBeNull();
  });

  it("serves bundled seed media read-only and rejects path traversal", async () => {
    const s = make();
    const seed = await s.get("seed/gifs/bounce.gif");
    expect(seed?.size).toBeGreaterThan(1000);
    await expect(s.put("seed/gifs/x.gif", Buffer.from("x"))).rejects.toThrow(/read-only/);
    await s.delete("seed/gifs/bounce.gif"); // no-op
    expect(await s.get("seed/gifs/bounce.gif")).not.toBeNull();
    await expect(s.put("../escape.bin", Buffer.from("x"))).rejects.toThrow(/invalid storage key/);
  });
});

describe("s3 adapter specifics", () => {
  it("uses the configured key prefix, path-style requests and list pagination", () => {
    const seen = requests.map((r) => r.replace(/contract-[a-z0-9]+/, "contract-X")).join(" | ");
    expect(requests.some((r) => r.startsWith("PUT /test-bucket/app/ws/contract-")), seen).toBe(true);
    expect(requests.filter((r) => r.includes("list-type=2") && r.includes("continuation-token")).length, seen).toBeGreaterThan(0);
    expect(requests.some((r) => /^POST \/test-bucket\/?\?delete/.test(r)), seen).toBe(true);
  });
});
