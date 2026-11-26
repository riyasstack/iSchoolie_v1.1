/**
 * Media storage adapter.
 *
 * - "local" (development/demo): files under STORAGE_DIR, which survives restarts.
 *   Keys starting with "seed/" resolve read-only to assets/seed (shared fictional seed media).
 * - "s3": any S3-compatible bucket (./s3.ts). Objects stay private; delivery stays behind
 *   /api/media/:id so authorization runs on every read.
 * - "db": bytes in the app's own Postgres (./db.ts), for hosts without object storage.
 */
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../env";
import { createS3Storage, s3ConfigFromEnv } from "./s3";
import { createDbStorage } from "./db";

export interface StoredObject {
  size: number;
  stream: (range?: { start: number; end: number }) => ReadableStream<Uint8Array>;
}

export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
}

// Runtime data directories: excluded from build output tracing (they're read at runtime,
// not bundled), so the build doesn't trace the whole project.
const SEED_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "assets", "seed");

function resolveKey(key: string): string {
  if (key.includes("..") || path.isAbsolute(key)) throw new Error("invalid storage key");
  if (key.startsWith("seed/")) return path.join(SEED_DIR, key.slice(5));
  return path.join(path.resolve(/* turbopackIgnore: true */ process.cwd(), env.storageDir), key);
}

function nodeToWeb(stream: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      stream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      stream.on("end", () => controller.close());
      stream.on("error", (e) => controller.error(e));
    },
    cancel() {
      (stream as unknown as { destroy?: () => void }).destroy?.();
    },
  });
}

export const localStorage: StorageAdapter = {
  async put(key, data) {
    if (key.startsWith("seed/")) throw new Error("seed storage is read-only");
    const file = resolveKey(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  },
  async get(key) {
    const file = resolveKey(key);
    try {
      const st = await fs.stat(file);
      return {
        size: st.size,
        stream: (range) => nodeToWeb(createReadStream(file, range ? { start: range.start, end: range.end } : undefined)),
      };
    } catch {
      return null;
    }
  },
  async delete(key) {
    if (key.startsWith("seed/")) return;
    await fs.rm(resolveKey(key), { force: true });
  },
  async deletePrefix(prefix) {
    if (prefix.startsWith("seed/") || !prefix) return;
    await fs.rm(resolveKey(prefix), { recursive: true, force: true });
  },
};

let s3Adapter: StorageAdapter | null = null;
let dbAdapter: StorageAdapter | null = null;

export function storage(): StorageAdapter {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "local") return localStorage;
  if (driver === "s3") return (s3Adapter ??= createS3Storage(s3ConfigFromEnv(), localStorage));
  if (driver === "db") return (dbAdapter ??= createDbStorage(localStorage));
  // No silent fallback to another backend.
  throw new Error(`Unknown STORAGE_DRIVER "${driver}" (use "local", "s3" or "db").`);
}
