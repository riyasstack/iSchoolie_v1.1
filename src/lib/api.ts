"use client";
/** Client fetch wrapper for the JSON API: CSRF header, structured errors, session-expiry signal. */
import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
    public requestId?: string,
  ) {
    super(message);
  }
}

export const SESSION_EVENT = "ischoolie:session-expired";

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = init.method ?? "GET";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(method !== "GET" ? { "x-ischoolie-csrf": "1" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
      cache: "no-store",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("NETWORK", "You appear to be offline. Check your connection and try again.", 0);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    if (!res.ok) throw new ApiError("INTERNAL", "Something went wrong. Try again.", res.status);
  }
  if (!res.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    const e = new ApiError(err?.code ?? "INTERNAL", err?.message ?? "Something went wrong. Try again.", res.status, err?.details, err?.requestId);
    if (e.code === "SESSION_EXPIRED" || e.code === "SESSION_REQUIRED") {
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: e.code }));
    }
    throw e;
  }
  return (json as { data: T }).data;
}

export const get = <T,>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body ?? {} });
export const put = <T,>(path: string, body?: unknown) => api<T>(path, { method: "PUT", body: body ?? {} });
export const patch = <T,>(path: string, body?: unknown) => api<T>(path, { method: "PATCH", body: body ?? {} });
export const del = <T,>(path: string, body?: unknown) => api<T>(path, { method: "DELETE", body });

/** Upload with progress and cancellation (fetch has no upload progress). */
export function uploadFile<T>(
  file: Blob,
  fields: Record<string, string>,
  onProgress: (fraction: number) => void,
  extraFiles: Record<string, Blob> = {},
): { promise: Promise<T>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<T>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file, (file as File).name ?? "upload");
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    for (const [k, b] of Object.entries(extraFiles)) form.append(k, b, `${k}.jpg`);
    xhr.open("POST", "/api/media");
    xhr.setRequestHeader("x-ischoolie-csrf", "1");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve((body as { data: T }).data);
      else {
        const err = (body as ApiErrorBody | null)?.error;
        reject(new ApiError(err?.code ?? "INTERNAL", err?.message ?? "Upload failed. Try again.", xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError("NETWORK", "Upload failed — check your connection and retry.", 0));
    xhr.onabort = () => reject(new ApiError("ABORTED", "Upload canceled.", 0));
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

export function newClientKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
