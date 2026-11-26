/**
 * Generates deterministic, original seed media into assets/seed (committed).
 * Everything is drawn from code here — no third-party images — so licensing is clear.
 *  - avatars: geometric portraits with initials (400x400 JPEG)
 *  - banners: pattern art (1500x500 JPEG)
 *  - photos: illustrated scenes (1200x~800 JPEG)
 *  - gifs: small animated loops (gifenc)
 *  - video: a short WebM made from generated frames via Playwright's bundled ffmpeg (if present)
 */
import sharp from "sharp";
import { mkdirSync, existsSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { SEED_USERS } from "../src/server/seed/fixtures";

const OUT = "assets/seed";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = [
  ["#1839E8", "#E8EEFF", "#14151B", "#FFB547"],
  ["#0F766E", "#CCFBF1", "#134E4A", "#F59E0B"],
  ["#B45309", "#FEF3C7", "#451A03", "#2563EB"],
  ["#7C3AED", "#EDE9FE", "#2E1065", "#10B981"],
  ["#BE123C", "#FFE4E6", "#4C0519", "#0EA5E9"],
  ["#15803D", "#DCFCE7", "#052E16", "#F97316"],
  ["#0369A1", "#E0F2FE", "#082F49", "#E11D48"],
  ["#A16207", "#FEF9C3", "#422006", "#7C3AED"],
];

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

async function avatar(handle: string, name: string, i: number) {
  const r = rng(i * 97 + 13);
  const p = PALETTES[i % PALETTES.length];
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const shapes = Array.from({ length: 5 }, () => {
    const x = Math.round(r() * 400), y = Math.round(r() * 400), s = 60 + Math.round(r() * 160);
    return `<circle cx="${x}" cy="${y}" r="${s / 2}" fill="${p[Math.floor(r() * 2) + 2]}" opacity="0.18"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <rect width="400" height="400" fill="${p[0]}"/>${shapes}
    <circle cx="200" cy="420" r="170" fill="${p[1]}" opacity="0.9"/>
    <circle cx="200" cy="170" r="78" fill="${p[1]}" opacity="0.95"/>
    <text x="200" y="196" font-family="Segoe UI, Arial, sans-serif" font-size="72" font-weight="700" text-anchor="middle" fill="${p[0]}">${esc(initials)}</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toFile(path.join(OUT, "avatars", `${handle}.jpg`));
}

async function banner(handle: string, i: number) {
  const r = rng(i * 31 + 7);
  const p = PALETTES[(i + 3) % PALETTES.length];
  const kind = i % 3;
  let body = "";
  if (kind === 0) {
    for (let y = 0; y < 500; y += 50)
      for (let x = 0; x < 1500; x += 50)
        if (r() > 0.55) body += `<rect x="${x}" y="${y}" width="50" height="50" fill="${p[Math.floor(r() * 4)]}" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`;
  } else if (kind === 1) {
    for (let k = 0; k < 14; k++) {
      const y = 40 + k * 34;
      body += `<path d="M0 ${y} Q 375 ${y - 60 + r() * 120} 750 ${y} T 1500 ${y}" stroke="${p[k % 4]}" stroke-width="${10 + r() * 14}" fill="none" opacity="0.8"/>`;
    }
  } else {
    for (let k = 0; k < 40; k++)
      body += `<circle cx="${Math.round(r() * 1500)}" cy="${Math.round(r() * 500)}" r="${20 + Math.round(r() * 90)}" fill="${p[Math.floor(r() * 4)]}" opacity="0.55"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="500"><rect width="1500" height="500" fill="${p[1]}"/>${body}</svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toFile(path.join(OUT, "banners", `${handle}.jpg`));
}

const PHOTO_SCENES: { file: string; w: number; h: number; draw: (r: () => number) => string }[] = [
  {
    file: "mountains.jpg", w: 1200, h: 800,
    draw: () => `<rect width="1200" height="800" fill="#BFDBFE"/><circle cx="900" cy="200" r="90" fill="#FDE68A"/>
      <path d="M0 620 L260 300 L460 560 L700 250 L1000 600 L1200 420 L1200 800 L0 800Z" fill="#334155"/>
      <path d="M700 250 L760 330 L720 320 L690 360 L660 310Z" fill="#F8FAFC"/><path d="M260 300 L310 370 L270 360 L240 390 L220 350Z" fill="#F8FAFC"/>
      <path d="M0 700 Q 300 620 600 700 T 1200 680 L1200 800 L0 800Z" fill="#166534"/>`,
  },
  {
    file: "library.jpg", w: 1200, h: 800,
    draw: (r) => {
      let books = "";
      for (let shelf = 0; shelf < 4; shelf++) {
        let x = 80;
        const y = 130 + shelf * 170;
        while (x < 1110) {
          const w = 18 + Math.round(r() * 26), h = 100 + Math.round(r() * 40);
          const c = ["#1D4ED8", "#B91C1C", "#047857", "#A16207", "#6D28D9", "#0F172A", "#C2410C"][Math.floor(r() * 7)];
          books += `<rect x="${x}" y="${y + 140 - h}" width="${w}" height="${h}" fill="${c}" rx="2"/>`;
          x += w + 3;
        }
        books += `<rect x="60" y="${y + 140}" width="1080" height="16" fill="#78350F"/>`;
      }
      return `<rect width="1200" height="800" fill="#FEF3C7"/>${books}`;
    },
  },
  {
    file: "chalkboard.jpg", w: 1200, h: 800,
    draw: () => `<rect width="1200" height="800" fill="#7C2D12"/><rect x="60" y="60" width="1080" height="640" fill="#14532D"/>
      <text x="120" y="200" font-family="Segoe Print, Comic Sans MS, cursive" font-size="64" fill="#F0FDF4">E = mc²</text>
      <text x="120" y="330" font-family="Segoe Print, Comic Sans MS, cursive" font-size="54" fill="#F0FDF4">a² + b² = c²</text>
      <text x="120" y="460" font-family="Segoe Print, Comic Sans MS, cursive" font-size="54" fill="#F0FDF4">∫ x dx = x²/2 + C</text>
      <path d="M760 560 L900 300 L1040 560Z" stroke="#F0FDF4" stroke-width="6" fill="none"/>
      <rect x="60" y="700" width="1080" height="40" fill="#A8A29E"/>`,
  },
  {
    file: "garden.jpg", w: 1200, h: 900,
    draw: (r) => {
      let flowers = "";
      for (let k = 0; k < 60; k++) {
        const x = Math.round(r() * 1200), y = 420 + Math.round(r() * 460);
        const c = ["#F43F5E", "#F59E0B", "#A855F7", "#FB7185", "#FACC15"][Math.floor(r() * 5)];
        flowers += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 60}" stroke="#15803D" stroke-width="5"/><circle cx="${x}" cy="${y}" r="${12 + Math.round(r() * 12)}" fill="${c}"/><circle cx="${x}" cy="${y}" r="6" fill="#FEF08A"/>`;
      }
      return `<rect width="1200" height="900" fill="#E0F2FE"/><rect y="400" width="1200" height="500" fill="#86EFAC"/>${flowers}`;
    },
  },
  {
    file: "robot.jpg", w: 1000, h: 1000,
    draw: () => `<rect width="1000" height="1000" fill="#F1F5F9"/><rect x="300" y="300" width="400" height="360" rx="40" fill="#1839E8"/>
      <rect x="360" y="380" width="280" height="140" rx="24" fill="#E0E7FF"/><circle cx="430" cy="450" r="32" fill="#14151B"/><circle cx="570" cy="450" r="32" fill="#14151B"/>
      <rect x="470" y="220" width="60" height="80" fill="#64748B"/><circle cx="500" cy="200" r="34" fill="#F59E0B"/>
      <rect x="340" y="680" width="80" height="160" rx="16" fill="#334155"/><rect x="580" y="680" width="80" height="160" rx="16" fill="#334155"/>
      <rect x="200" y="360" width="80" height="220" rx="30" fill="#334155"/><rect x="720" y="360" width="80" height="220" rx="30" fill="#334155"/>`,
  },
  {
    file: "chart.jpg", w: 1200, h: 675,
    draw: () => {
      const vals = [42, 55, 51, 68, 74, 81, 77, 92];
      let bars = "";
      vals.forEach((v, k) => (bars += `<rect x="${130 + k * 125}" y="${590 - v * 5.5}" width="80" height="${v * 5.5}" fill="#1839E8" rx="4"/><text x="${170 + k * 125}" y="625" font-family="Segoe UI, Arial" font-size="26" text-anchor="middle" fill="#334155">W${k + 1}</text>`));
      return `<rect width="1200" height="675" fill="#FFFFFF"/><text x="80" y="70" font-family="Segoe UI, Arial" font-size="38" font-weight="700" fill="#0F172A">Robotics club practice hours</text><line x1="100" y1="590" x2="1140" y2="590" stroke="#94A3B8" stroke-width="3"/>${bars}`;
    },
  },
  {
    file: "night-sky.jpg", w: 1200, h: 800,
    draw: (r) => {
      let stars = "";
      for (let k = 0; k < 220; k++) stars += `<circle cx="${Math.round(r() * 1200)}" cy="${Math.round(r() * 600)}" r="${(r() * 2.4 + 0.4).toFixed(1)}" fill="#FFFFFF" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`;
      return `<rect width="1200" height="800" fill="#0B1026"/>${stars}<circle cx="920" cy="180" r="70" fill="#F8FAFC"/><circle cx="950" cy="160" r="70" fill="#0B1026"/><path d="M0 640 Q 300 560 600 650 T 1200 600 L1200 800 L0 800Z" fill="#111827"/>`;
    },
  },
  {
    file: "pottery.jpg", w: 900, h: 1100,
    draw: () => `<rect width="900" height="1100" fill="#FAF5EF"/><rect y="820" width="900" height="280" fill="#D6C2A8"/>
      <path d="M330 300 Q 250 520 300 760 Q 450 840 600 760 Q 650 520 570 300 Z" fill="#B45309"/><ellipse cx="450" cy="300" rx="120" ry="30" fill="#92400E"/>
      <path d="M300 520 Q 450 560 600 520" stroke="#FDE68A" stroke-width="14" fill="none"/>`,
  },
  {
    file: "soccer.jpg", w: 1200, h: 800,
    draw: () => `<rect width="1200" height="800" fill="#16A34A"/><g stroke="#F0FDF4" stroke-width="8" fill="none"><rect x="60" y="60" width="1080" height="680"/><line x1="600" y1="60" x2="600" y2="740"/><circle cx="600" cy="400" r="110"/><rect x="60" y="250" width="160" height="300"/><rect x="980" y="250" width="160" height="300"/></g><circle cx="720" cy="470" r="34" fill="#FFFFFF" stroke="#0F172A" stroke-width="4"/>`,
  },
  {
    file: "lab.jpg", w: 1200, h: 800,
    draw: () => `<rect width="1200" height="800" fill="#ECFEFF"/><rect y="560" width="1200" height="240" fill="#475569"/>
      <path d="M300 220 L300 420 L200 560 L500 560 L400 420 L400 220Z" fill="#E0F2FE" stroke="#0F172A" stroke-width="6"/><path d="M230 520 L470 520 L500 560 L200 560Z" fill="#22D3EE"/>
      <rect x="640" y="260" width="60" height="300" rx="28" fill="#E0F2FE" stroke="#0F172A" stroke-width="6"/><rect x="646" y="420" width="48" height="134" rx="22" fill="#A855F7"/>
      <rect x="780" y="300" width="60" height="260" rx="28" fill="#E0F2FE" stroke="#0F172A" stroke-width="6"/><rect x="786" y="460" width="48" height="94" rx="22" fill="#F97316"/>`,
  },
];

async function photos() {
  for (const [k, scene] of PHOTO_SCENES.entries()) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.w}" height="${scene.h}">${scene.draw(rng(1000 + k))}</svg>`;
    await sharp(Buffer.from(svg)).jpeg({ quality: 84 }).toFile(path.join(OUT, "photos", scene.file));
  }
}

async function frames(count: number, w: number, h: number, draw: (t: number) => string) {
  const out: Buffer[] = [];
  for (let f = 0; f < count; f++) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${draw(f / count)}</svg>`;
    out.push(await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer());
  }
  return out;
}

async function gif(file: string, w: number, h: number, n: number, draw: (t: number) => string) {
  const fr = await frames(n, w, h, draw);
  const enc = GIFEncoder();
  for (const data of fr) {
    const rgba = new Uint8Array(data);
    const palette = quantize(rgba, 64);
    const index = applyPalette(rgba, palette);
    enc.writeFrame(index, w, h, { palette, delay: 60 });
  }
  enc.finish();
  writeFileSync(path.join(OUT, "gifs", file), Buffer.from(enc.bytes()));
}

async function gifs() {
  await gif("bounce.gif", 320, 240, 16, (t) => {
    const y = 40 + Math.abs(Math.sin(t * Math.PI)) * 130;
    return `<rect width="320" height="240" fill="#E8EEFF"/><ellipse cx="160" cy="222" rx="${30 + (y - 40) / 6}" ry="6" fill="#94A3B8"/><circle cx="160" cy="${230 - y}" r="28" fill="#1839E8"/>`;
  });
  await gif("clap.gif", 320, 240, 12, (t) => {
    const s = 1 + 0.25 * Math.sin(t * Math.PI * 2);
    return `<rect width="320" height="240" fill="#FEF3C7"/><g transform="translate(160 120) scale(${s.toFixed(3)})"><path d="M0 -60 L16 -18 L60 -18 L24 8 L38 52 L0 26 L-38 52 L-24 8 L-60 -18 L-16 -18Z" fill="#F59E0B"/></g><text x="160" y="225" font-family="Segoe UI, Arial" font-size="22" font-weight="700" text-anchor="middle" fill="#78350F">Great job!</text>`;
  });
  await gif("spinner.gif", 320, 240, 12, (t) => {
    const a = t * 360;
    return `<rect width="320" height="240" fill="#ECFDF5"/><g transform="translate(160 120) rotate(${a.toFixed(1)})"><rect x="-70" y="-10" width="140" height="20" rx="10" fill="#059669"/><rect x="-10" y="-70" width="20" height="140" rx="10" fill="#10B981"/></g>`;
  });
  await gif("thinking.gif", 320, 240, 10, (t) => {
    const dots = Math.floor(t * 4);
    return `<rect width="320" height="240" fill="#F5F3FF"/><text x="160" y="135" font-family="Segoe UI, Arial" font-size="34" font-weight="700" text-anchor="middle" fill="#5B21B6">Studying${".".repeat(dots)}</text>`;
  });
}

function findFfmpeg(): string | null {
  const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  if (!existsSync(base)) return null;
  for (const dir of readdirSync(base).filter((d) => d.startsWith("ffmpeg"))) {
    for (const exe of ["ffmpeg-win64.exe", "ffmpeg-linux", "ffmpeg-mac"]) {
      const p = path.join(base, dir, exe);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

async function video() {
  const ffmpeg = findFfmpeg();
  const target = path.join(OUT, "video", "orbit.webm");
  if (!ffmpeg) {
    console.warn("! Playwright ffmpeg not found; skipping video generation (existing file kept if present).");
    return;
  }
  const w = 640, h = 360, n = 96;
  const tmp = path.join(OUT, "video", "_frames");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const chunks: Buffer[] = [];
  for (let f = 0; f < n; f++) {
    const t = f / n;
    const a = t * Math.PI * 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#0B1026"/>
      <circle cx="320" cy="180" r="46" fill="#FDE68A"/>
      <ellipse cx="320" cy="180" rx="200" ry="80" stroke="#334155" stroke-width="2" fill="none"/>
      <circle cx="${(320 + Math.cos(a) * 200).toFixed(1)}" cy="${(180 + Math.sin(a) * 80).toFixed(1)}" r="18" fill="#1839E8"/>
      <circle cx="${(320 + Math.cos(a * 2.2) * 120).toFixed(1)}" cy="${(180 + Math.sin(a * 2.2) * 48).toFixed(1)}" r="9" fill="#F43F5E"/>
      <text x="24" y="336" font-family="Segoe UI, Arial" font-size="20" fill="#CBD5E1">iSchoolie astronomy club · orbit demo</text></svg>`;
    chunks.push(await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer());
  }
  const res = spawnSync(ffmpeg, ["-y", "-f", "image2pipe", "-c:v", "mjpeg", "-r", "24", "-i", "pipe:0", "-c:v", "libvpx-vp9", "-b:v", "700k", "-deadline", "good", "-cpu-used", "4", "-pix_fmt", "yuv420p", "-an", target], {
    input: Buffer.concat(chunks),
    maxBuffer: 1 << 28,
  });
  rmSync(tmp, { recursive: true, force: true });
  if (res.status !== 0) {
    console.warn("! ffmpeg failed:", res.stderr?.toString().split("\n").slice(-4).join("\n"));
    return;
  }
  // Poster frame.
  await sharp(chunks[12]).toFile(path.join(OUT, "video", "orbit-poster.jpg"));
}

async function main() {
  for (const d of ["avatars", "banners", "photos", "gifs", "video"]) mkdirSync(path.join(OUT, d), { recursive: true });
  for (const [i, u] of SEED_USERS.entries()) {
    if (u.noAvatar) continue;
    await avatar(u.handle, u.name, i);
    await banner(u.handle, i);
  }
  await photos();
  await gifs();
  await video();
  console.log("seed assets written to", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
