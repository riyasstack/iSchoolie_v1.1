/**
 * Realtime fan-out: PostgreSQL LISTEN/NOTIFY → per-process subscribers → SSE.
 *
 * - Writers call `publish(tx, event)` inside their transaction; PostgreSQL delivers
 *   the notification only on commit, so clients never hear about rolled-back writes.
 * - Each server process keeps one dedicated LISTEN connection (reconnects with backoff)
 *   and dispatches to in-memory subscribers keyed by user id. Works across processes
 *   and instances because delivery goes through the database.
 * - Events carry ids only. Clients re-fetch through the normal authorized API, so the
 *   stream can't leak content (and a stale subscription after an actor switch can only
 *   trigger a refetch that is authorized as the current actor).
 */
import { Client } from "pg";
import { runtimeDatabaseUrl } from "./db-url";
import type { Db } from "./db";
import { log } from "./log";

export const CHANNEL = "isc_events";

export type RealtimeEvent =
  | { type: "message"; ws: string; users: string[]; conversationId: string }
  | { type: "conversation"; ws: string; users: string[]; conversationId: string }
  | { type: "read"; ws: string; users: string[]; conversationId: string }
  | { type: "notification"; ws: string; users: string[] };

export async function publish(db: Db, event: RealtimeEvent) {
  if (!event.users.length) return;
  const payload = JSON.stringify(event);
  if (payload.length > 7500) {
    // pg_notify payloads are limited to 8000 bytes; split recipients if ever needed.
    const half = Math.ceil(event.users.length / 2);
    await publish(db, { ...event, users: event.users.slice(0, half) } as RealtimeEvent);
    await publish(db, { ...event, users: event.users.slice(half) } as RealtimeEvent);
    return;
  }
  await db.$executeRaw`SELECT pg_notify(${CHANNEL}, ${payload})`;
}

type Listener = (e: RealtimeEvent) => void;

class Hub {
  private subs = new Map<string, Set<Listener>>();
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private retry = 0;

  subscribe(userId: string, fn: Listener): () => void {
    let set = this.subs.get(userId);
    if (!set) this.subs.set(userId, (set = new Set()));
    set.add(fn);
    void this.ensure();
    return () => {
      set!.delete(fn);
      if (!set!.size) this.subs.delete(userId);
    };
  }

  get size() {
    let n = 0;
    for (const s of this.subs.values()) n += s.size;
    return n;
  }

  /** Resolves once the LISTEN connection is active. */
  ensure(): Promise<void> {
    if (this.client) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const client = new Client({ connectionString: runtimeDatabaseUrl(), options: "-c timezone=UTC" });
      client.on("notification", (msg) => {
        if (msg.channel !== CHANNEL || !msg.payload) return;
        let e: RealtimeEvent;
        try {
          e = JSON.parse(msg.payload) as RealtimeEvent;
        } catch {
          return;
        }
        for (const uid of e.users) for (const fn of this.subs.get(uid) ?? []) fn(e);
      });
      client.on("error", (err) => {
        log("warn", "realtime_listener_error", { error: err.message });
        this.reset();
      });
      client.on("end", () => this.reset());
      try {
        await client.connect();
        await client.query(`LISTEN ${CHANNEL}`);
        this.client = client;
        this.retry = 0;
      } catch (err) {
        log("warn", "realtime_listener_connect_failed", { error: (err as Error).message });
        client.end().catch(() => {});
        this.scheduleReconnect();
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }

  private reset() {
    if (this.client) this.client.end().catch(() => {});
    this.client = null;
    if (this.subs.size) this.scheduleReconnect();
  }

  private scheduleReconnect() {
    const delay = Math.min(30_000, 500 * 2 ** this.retry++);
    setTimeout(() => {
      if (this.subs.size) void this.ensure();
    }, delay);
  }
}

const g = globalThis as unknown as { __iscHub?: Hub };
export const hub: Hub = g.__iscHub ?? (g.__iscHub = new Hub());

/** Server-Sent Events response streaming the actor's realtime events. */
export function sseResponse(actorId: string, workspaceId: string, signal: AbortSignal): Response {
  // Serverless hosts can't hold a LISTEN connection or long-lived streams through a
  // transaction pooler. REALTIME=off answers 204, which tells EventSource not to
  // reconnect; the client then relies on its polling fallback.
  if (process.env.REALTIME === "off") return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  const enc = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          /* stream closed */
        }
      };
      // Tell EventSource to retry after 3 s if the connection drops.
      send(`retry: 3000\n\n`);
      unsubscribe = hub.subscribe(actorId, (e) => {
        if (e.ws !== workspaceId) return;
        const data = e.type === "notification" ? {} : { conversationId: e.conversationId };
        send(`event: ${e.type}\ndata: ${JSON.stringify(data)}\n\n`);
      });
      await hub.ensure();
      send(`event: ready\ndata: {}\n\n`);
      heartbeat = setInterval(() => send(`: keep-alive\n\n`), 25_000);
      signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      clearInterval(heartbeat);
      unsubscribe();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "private, no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
