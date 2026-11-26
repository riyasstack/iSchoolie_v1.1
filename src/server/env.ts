export type AppMode = "demo" | "live";

function readMode(): AppMode {
  const raw = (process.env.APP_MODE ?? "").trim().toLowerCase();
  if (raw === "demo" || raw === "live") return raw;
  // No implicit fallback: an unset/unknown APP_MODE is a configuration error.
  throw new Error(`APP_MODE must be "demo" or "live" (got ${JSON.stringify(process.env.APP_MODE)})`);
}

export const env = {
  get mode(): AppMode {
    return readMode();
  },
  get sessionSecret(): string {
    const s = process.env.SESSION_SECRET ?? "";
    if (s.length < 32 || s === "replace-with-a-long-random-value") {
      throw new Error("SESSION_SECRET must be set to a random value of at least 32 characters");
    }
    return s;
  },
  retentionDays: Number(process.env.DEMO_RETENTION_DAYS ?? 7),
  provisionLimitPerHour: Number(process.env.DEMO_PROVISION_LIMIT_PER_HOUR ?? 20),
  storageDir: process.env.STORAGE_DIR ?? ".data/storage",
  forceSecureCookies: process.env.FORCE_SECURE_COOKIES === "true",
};
