/**
 * S3-compatible storage adapter (AWS S3, Cloudflare R2, MinIO, …).
 *
 * Objects are private (no public ACLs); delivery stays behind /api/media/:id so every read
 * is authorized. Seed media ("seed/…") is still read from the app's bundled assets.
 *
 * Environment:
 *   STORAGE_DRIVER=s3
 *   S3_BUCKET            bucket name (required)
 *   S3_REGION            e.g. us-east-1 (required; use "auto" for R2)
 *   S3_ENDPOINT          optional custom endpoint (R2/MinIO)
 *   S3_FORCE_PATH_STYLE  "true" for MinIO-style path addressing
 *   S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY  optional; otherwise the default AWS credential chain
 *   S3_PREFIX            optional key prefix (e.g. "ischoolie/")
 */
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import type { StorageAdapter, StoredObject } from "./index";

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  prefix?: string;
}

export function s3ConfigFromEnv(): S3Config {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION;
  if (!bucket || !region) throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET and S3_REGION.");
  return {
    bucket,
    region,
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    accessKeyId: process.env.S3_ACCESS_KEY_ID || undefined,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || undefined,
    prefix: process.env.S3_PREFIX || "",
  };
}

function validKey(key: string) {
  if (!key || key.includes("..") || key.startsWith("/")) throw new Error("invalid storage key");
}

export function createS3Storage(cfg: S3Config, seed: StorageAdapter): StorageAdapter {
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: cfg.accessKeyId && cfg.secretAccessKey ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } : undefined,
    // Widest compatibility with S3-compatible services.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const k = (key: string) => `${cfg.prefix ?? ""}${key}`;
  const isMissing = (e: unknown) => {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    return err?.name === "NotFound" || err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404;
  };

  return {
    async put(key, data) {
      if (key.startsWith("seed/")) throw new Error("seed storage is read-only");
      validKey(key);
      await client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: k(key), Body: data, ContentLength: data.length }));
    },
    async get(key): Promise<StoredObject | null> {
      if (key.startsWith("seed/")) return seed.get(key);
      validKey(key);
      let size: number;
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: k(key) }));
        size = Number(head.ContentLength ?? 0);
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
      return {
        size,
        stream: (range) =>
          new ReadableStream<Uint8Array>({
            async start(controller) {
              try {
                const obj = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: k(key), Range: range ? `bytes=${range.start}-${range.end}` : undefined }));
                const body = obj.Body?.transformToWebStream();
                if (!body) return controller.close();
                const reader = body.getReader();
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  controller.enqueue(value);
                }
                controller.close();
              } catch (e) {
                controller.error(e);
              }
            },
          }),
      };
    },
    async delete(key) {
      if (key.startsWith("seed/")) return;
      validKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: k(key) }));
    },
    async deletePrefix(prefix) {
      if (!prefix || prefix.startsWith("seed/")) return;
      validKey(prefix);
      let token: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: k(prefix), ContinuationToken: token }));
        const keys = (page.Contents ?? []).map((o) => o.Key!).filter(Boolean);
        for (let i = 0; i < keys.length; i += 1000) {
          await client.send(new DeleteObjectsCommand({ Bucket: cfg.bucket, Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } }));
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    },
  };
}
