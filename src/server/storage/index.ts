/**
 * Media storage adapter.
 *
 * - "local" (development/demo): files under STORAGE_DIR, which survives restarts.
 *   Keys starting with "seed/" resolve read-only to assets/seed (shared fictional seed media).
 * - Production: implement the same interface against an S3-compatible bucket
 *   (put/get/delete with private ACLs; delivery stays behind /api/media/:id so
 *   authorization runs on every read). See docs/ARCHITECTURE.md.
 */
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../env";

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

const SEED_DIR = path.resolve("assets/seed");

function resolveKey(key: string): string {
  if (key.includes("..") || path.isAbsolute(key)) throw new Error("invalid storage key");
  if (key.startsWith("seed/")) return path.join(SEED_DIR, key.slice(5));
  return path.join(path.resolve(env.storageDir), key);
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

export function storage(): StorageAdapter {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "local") return localStorage;
  // No silent fallback to another backend.
  throw new Error(`STORAGE_DRIVER "${driver}" is not configured in this build. See docs/ARCHITECTURE.md.`);
}
