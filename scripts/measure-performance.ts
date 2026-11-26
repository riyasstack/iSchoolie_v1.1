/**
 * Measures load and layout-stability metrics with Chromium against a running server.
 * Usage: npx tsx scripts/measure-performance.ts [baseUrl]
 * Reports TTFB, FCP, LCP, CLS and long-task time for cold and warm loads.
 */
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3100";

async function measure(page: import("@playwright/test").Page, path: string) {
  await page.addInitScript(() => {
    (window as unknown as { __m: Record<string, number> }).__m = { lcp: 0, cls: 0, longtask: 0 };
    const m = (window as unknown as { __m: Record<string, number> }).__m;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (m.lcp = Math.max(m.lcp, e.startTime)))).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => {
        const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!s.hadRecentInput) m.cls += s.value;
      }),
    ).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (m.longtask += e.duration))).observe({ type: "longtask", buffered: true });
  });
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    const m = (window as unknown as { __m: Record<string, number> }).__m;
    return {
      ttfb: Math.round(nav.responseStart),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      fcp: Math.round(fcp),
      lcp: Math.round(m.lcp),
      cls: Number(m.cls.toFixed(3)),
      longTaskMs: Math.round(m.longtask),
      articles: document.querySelectorAll("main article").length,
    };
  });
}

async function main() {
  const browser = await chromium.launch();
  const results: Record<string, unknown> = {};
  for (const [label, viewport] of [["desktop-1280", { width: 1280, height: 900 }], ["mobile-390", { width: 390, height: 844 }]] as const) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    // First visit provisions a workspace (redirect + seed) — measured separately as "cold".
    results[`${label} cold /`] = await measure(page, "/");
    for (const path of ["/home", "/explore", "/maya_learns", "/notifications", "/messages"]) results[`${label} warm ${path}`] = await measure(page, path);
    await ctx.close();
  }
  await browser.close();
  console.table(results);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
