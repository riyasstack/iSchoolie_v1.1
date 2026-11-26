/**
 * Runs a project-local PostgreSQL 17 (embedded-postgres, real PG binaries) with
 * data persisted in .data/postgres. Optional: point DATABASE_URL at any other
 * PostgreSQL server and skip this command.
 */
import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const port = Number(process.env.EMBEDDED_PG_PORT ?? 54329);
const dataDir = path.resolve(".data/postgres");

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "ischoolie",
    password: "ischoolie",
    port,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-collate=C", "--lc-ctype=C"],
    onLog: () => {},
    onError: (e) => console.error("[postgres]", e),
  });
  const fresh = !existsSync(path.join(dataDir, "PG_VERSION"));
  if (fresh) {
    console.log("[db] initialising data directory", dataDir);
    await pg.initialise();
  }
  await pg.start();
  if (fresh) {
    await pg.createDatabase("ischoolie");
    await pg.createDatabase("ischoolie_test");
  }
  // Default every new session to UTC (the app also pins this per connection).
  const client = pg.getPgClient();
  await client.connect();
  await client.query("ALTER DATABASE ischoolie SET timezone TO 'UTC'");
  await client.query("ALTER DATABASE ischoolie_test SET timezone TO 'UTC'");
  await client.end();
  console.log(`[db] PostgreSQL ready on 127.0.0.1:${port} (databases: ischoolie, ischoolie_test)`);
  const stop = async () => {
    console.log("[db] stopping");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {}, 1 << 30);
}

main().catch((e) => {
  console.error("[db] failed to start:", e);
  process.exit(1);
});
