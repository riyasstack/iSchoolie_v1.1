import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations need a direct or session-mode connection; the app itself may use a
// transaction pooler. DIRECT_URL (if set) is used for Prisma CLI commands.
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: url ?? "",
  },
});
