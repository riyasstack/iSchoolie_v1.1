/** Applies migrations to the separate test database (never the dev database). */
import "dotenv/config";
import { execSync } from "node:child_process";

const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL?.replace(/\/ischoolie(\?|$)/, "/ischoolie_test$1");
if (!base || !/test/.test(base)) {
  console.error("Refusing to run: test database URL must contain 'test'.");
  process.exit(1);
}
execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: base } });
