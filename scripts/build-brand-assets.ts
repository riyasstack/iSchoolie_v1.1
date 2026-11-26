/**
 * Builds web-ready iSchoolie brand assets from the supplied raster master.
 *
 * Master: assets/brand/ischoolie-logo-master-1280.png (opaque white background,
 * symbol #1838E8, wordmark #141418). Nothing is redrawn or traced:
 *  - The white background is removed with an exact color-to-alpha unmix, so the
 *    artwork composites back onto white pixel-identically.
 *  - Exterior whitespace is trimmed (with a small safety margin).
 *  - The compact symbol is a crop of the existing symbol pixels.
 *  - The dark-theme variant keeps the blue symbol pixels unchanged and recolors only
 *    the wordmark's ink to a light neutral so the identity stays legible on dark
 *    backgrounds (the whole logo is never inverted).
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const MASTER = "assets/brand/ischoolie-logo-master-1280.png";
const OUT = "public/brand";
const MARGIN = 6;
// Column bounds measured from the master: symbol ink ends at x=320, wordmark starts at x=366.
const SYMBOL_MAX_X = 343;
const WORDMARK_LIGHT = [231, 233, 234];

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync("src/app", { recursive: true });
  const { data, info } = await sharp(MASTER).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const out = Buffer.alloc(data.length);
  // Color-to-alpha against pure white.
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const a = Math.max(255 - r, 255 - g, 255 - b) / 255;
    if (a <= 1 / 255) {
      out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
      continue;
    }
    out[i] = clamp((r - (1 - a) * 255) / a);
    out[i + 1] = clamp((g - (1 - a) * 255) / a);
    out[i + 2] = clamp((b - (1 - a) * 255) / a);
    out[i + 3] = Math.round(a * 255);
  }
  // Bounding box of visible ink.
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (out[(y * width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  const raw = { raw: { width, height, channels: 4 as const } };
  const box = (l: number, r: number) => ({
    left: Math.max(0, l - MARGIN),
    top: Math.max(0, y0 - MARGIN),
    width: Math.min(width, r + MARGIN + 1) - Math.max(0, l - MARGIN),
    height: Math.min(height, y1 + MARGIN + 1) - Math.max(0, y0 - MARGIN),
  });

  // Full logo (light surfaces).
  await sharp(out, raw).extract(box(x0, x1)).png({ compressionLevel: 9 }).toFile(`${OUT}/ischoolie-logo.png`);

  // Dark-surface variant: recolor wordmark ink only.
  const dark = Buffer.from(out);
  for (let y = 0; y < height; y++)
    for (let x = SYMBOL_MAX_X; x < width; x++) {
      const i = (y * width + x) * 4;
      if (dark[i + 3] === 0) continue;
      dark[i] = WORDMARK_LIGHT[0];
      dark[i + 1] = WORDMARK_LIGHT[1];
      dark[i + 2] = WORDMARK_LIGHT[2];
    }
  await sharp(dark, raw).extract(box(x0, x1)).png({ compressionLevel: 9 }).toFile(`${OUT}/ischoolie-logo-on-dark.png`);

  // Symbol crop: find the symbol's own bounding box.
  let sx1 = 0, sy0 = height, sy1 = 0;
  for (let y = 0; y < height; y++)
    for (let x = x0; x < SYMBOL_MAX_X; x++)
      if (out[(y * width + x) * 4 + 3] > 8) {
        if (x > sx1) sx1 = x;
        if (y < sy0) sy0 = y;
        if (y > sy1) sy1 = y;
      }
  const symW = sx1 - x0 + 1, symH = sy1 - sy0 + 1;
  const side = Math.max(symW, symH) + 2 * MARGIN;
  const symbol = await sharp(out, raw)
    .extract({ left: x0, top: sy0, width: symW, height: symH })
    .png()
    .toBuffer();
  const square = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: symbol, left: Math.round((side - symW) / 2), top: Math.round((side - symH) / 2) }])
    .png()
    .toBuffer();
  await sharp(square).png({ compressionLevel: 9 }).toFile(`${OUT}/ischoolie-symbol.png`);

  // Favicons / app icons from the symbol crop (scaled, never stretched).
  await sharp(square).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile("src/app/icon.png");
  const appleSymbol = await sharp(square).resize(140, 140, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: 180, height: 180, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: appleSymbol, left: 20, top: 20 }])
    .png()
    .toFile("src/app/apple-icon.png");
  await sharp(square).resize(192, 192, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } }).flatten({ background: "#ffffff" }).png().toFile(`${OUT}/icon-192.png`);
  await sharp(square).resize(512, 512, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } }).flatten({ background: "#ffffff" }).png().toFile(`${OUT}/icon-512.png`);

  const full = await sharp(`${OUT}/ischoolie-logo.png`).metadata();
  console.log(`logo ${full.width}x${full.height}, symbol ${side}x${side}`);
}

function clamp(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
