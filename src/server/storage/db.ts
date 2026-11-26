/**
 * Postgres storage adapter (STORAGE_DRIVER=db): file bytes live in the StoredObject table
 * of the app's own database. For hosting without object storage (e.g. Vercel + Supabase
 * Postgres without S3 keys). Uploads are already capped (images 5 MB, re-encoded and
 * resized), so rows stay small. Delivery stays behind /api/media/:id, as with every adapter.
 * Keys starting with "seed/" resolve read-only to the bundled seed media.
 */
import { prisma } from "../db";
import type { StorageAdapter, StoredObject } from "./index";

function validKey(key: string) {
  if (!key || key.includes("..") || key.startsWith("/")) throw new Error("invalid storage key");
}

export function createDbStorage(seed: StorageAdapter): StorageAdapter {
  return {
    async put(key, data) {
      if (key.startsWith("seed/")) throw new Error("seed storage is read-only");
      validKey(key);
      const bytes = new Uint8Array(data);
      await prisma.storedObject.upsert({
        where: { key },
        create: { key, data: bytes, size: data.length },
        update: { data: bytes, size: data.length, createdAt: new Date() },
      });
    },
    async get(key): Promise<StoredObject | null> {
      if (key.startsWith("seed/")) return seed.get(key);
      validKey(key);
      const row = await prisma.storedObject.findUnique({ where: { key }, select: { size: true } });
      if (!row) return null;
      return {
        size: row.size,
        stream: (range) => {
          // Read lazily, and only the requested byte range (Postgres substring is 1-based).
          let started = false;
          return new ReadableStream<Uint8Array>({
            async pull(controller) {
              if (started) return;
              started = true;
              try {
                const start = range ? range.start : 0;
                const length = range ? range.end - range.start + 1 : row.size;
                const rows = await prisma.$queryRaw<{ chunk: Uint8Array }[]>`
                  SELECT substring("data" FROM ${start + 1}::int FOR ${length}::int) AS chunk FROM "StoredObject" WHERE "key" = ${key}`;
                if (!rows[0]) throw new Error("storage object disappeared");
                controller.enqueue(new Uint8Array(rows[0].chunk));
                controller.close();
              } catch (e) {
                controller.error(e);
              }
            },
          });
        },
      };
    },
    async delete(key) {
      if (key.startsWith("seed/")) return;
      validKey(key);
      await prisma.storedObject.deleteMany({ where: { key } });
    },
    async deletePrefix(prefix) {
      if (!prefix || prefix.startsWith("seed/")) return;
      validKey(prefix);
      // Same semantics as the filesystem adapter: the prefix is a path, so "a/p" removes
      // "a/p" and "a/p/…" but not "a/p2".
      await prisma.$executeRaw`DELETE FROM "StoredObject" WHERE "key" = ${prefix} OR starts_with("key", ${prefix + "/"})`;
    },
  };
}
