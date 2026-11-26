/** Captures Home in each theme (desktop 1440 with expanded nav, and phone 390). Usage: npx tsx scripts/capture-themes.ts */
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3000";
async function main() {
  const b = await chromium.launch();
  for (const theme of ["DEFAULT", "DIM", "LIGHTS_OUT"]) {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const ctx = await b.newContext({ viewport: vp });
      const page = await ctx.newPage();
      await page.goto(`${base}/home`);
      await page.waitForSelector("main article");
      await page.request.fetch(`${base}/api/me/preferences`, { method: "PATCH", headers: { "x-ischoolie-csrf": "1", origin: base, "content-type": "application/json" }, data: JSON.stringify({ theme }) });
      await page.reload();
      await page.waitForSelector("main article img");
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `docs/screenshots/theme-${theme.toLowerCase()}-${vp.width}.png` });
      await ctx.close();
    }
  }
  await b.close();
}
main();
