import "dotenv/config";
import { defineConfig } from "prisma/config";
import { migrationDatabaseUrl } from "./src/server/db-url";

// Migrations need a direct or session-mode connection; the app itself may use a
// transaction pooler. DIRECT_URL / POSTGRES_URL_NON_POOLING (Supabase integration) are
// preferred for Prisma CLI commands.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationDatabaseUrl() ?? "",
  },
});
