// Regenerate public/og.png, the Open Graph card.
//
//   npm run gen-og
//
// The card is a build artefact that is committed rather than generated during
// the build, because it changes about once a year and rendering it needs a
// browser that the deploy environment has no other reason to carry. Run this
// when the site title, the tagline or the accent colour changes, and commit
// the result.
//
// Everything it draws comes from the same places the site does: the strings
// from src/consts.ts, the mark from public/favicon.svg, the colours from
// src/styles/tokens.css. Nothing is restated here, so the card cannot end up
// showing a tagline the site stopped using.

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/og.png");

/** Pull a string export out of consts.ts without importing TypeScript. */
function konst(name) {
  const source = readFileSync(join(ROOT, "src/consts.ts"), "utf8");
  const single = new RegExp(`export const ${name} =\\s*"([^"]*)"`).exec(source);
  if (single) return single[1];
  // A multi-line concatenation of quoted parts.
  const block = new RegExp(`export const ${name} =([\\s\\S]*?);`).exec(source);
  if (!block) throw new Error(`consts.ts has no ${name}`);
  return [...block[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]).join("");
}

/** One custom property's value from the token sheet. */
function token(name) {
  const css = readFileSync(join(ROOT, "src/styles/tokens.css"), "utf8");
  const hit = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(css);
  if (!hit) throw new Error(`tokens.css has no literal ${name}`);
  return hit[1];
}

const title = konst("SITE_TITLE");
const tagline = konst("SITE_TAGLINE");
const host = konst("SITE_HOST");
const accent = token("--accent-700");
const ground = token("--grey-50");
const ink = token("--grey-900");
const inkMuted = token("--grey-700");

// The favicon, inlined and resized. It is the mark; a second copy would drift.
const mark = readFileSync(join(ROOT, "public/favicon.svg"), "utf8")
  .replace(/<\?xml[^>]*\?>/, "")
  .replace("<svg", '<svg class="mark"')
  .trim();

const page = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  body{margin:0;width:1200px;height:630px;background:${ground};
       font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
       display:flex;flex-direction:column;justify-content:center;
       padding:0 86px;position:relative}
  .bar{position:absolute;top:0;left:0;right:0;height:14px;background:${accent}}
  .mark{width:96px;height:96px;margin-bottom:34px}
  h1{font-size:76px;line-height:1.02;margin:0 0 22px;color:${ink};letter-spacing:-.022em}
  p{font-size:35px;line-height:1.32;margin:0;color:${inkMuted};max-width:20ch;font-weight:400}
  .host{position:absolute;bottom:52px;left:86px;font-size:25px;color:${accent};
        font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
</style>
<div class="bar"></div>
${mark}
<h1>${title}</h1>
<p>${tagline}.</p>
<div class="host">${host}</div>`;

// playwright-core is a devDependency and brings no browser of its own, so it
// needs one already on the machine. Anything Chromium-shaped will do.
const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error(
    "gen-og: no Chromium found. Set CHROMIUM_PATH to one, or install Chrome.\n" +
      `Looked in:\n${CANDIDATES.map((p) => `  ${p}`).join("\n")}`,
  );
  process.exit(1);
}

const { chromium } = await import("playwright-core");
const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const tab = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await tab.setContent(page, { waitUntil: "load" });
await tab.screenshot({ path: OUT });
await browser.close();

console.log(`gen-og: wrote ${OUT} (1200x630) — "${title}: ${tagline}"`);
