import "dotenv/config";
// Integration tests run against a separate database (never the dev database).
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else if (process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/\/ischoolie(\?|$)/, "/ischoolie_test$1");
process.env.APP_MODE = process.env.APP_MODE ?? "demo";
