#!/usr/bin/env node
// gen-markdown.mjs — a markdown twin for every built page.
//
// The site answers `Accept: text/markdown` from the same URL that serves the
// HTML (acceptmarkdown.com); src/worker.ts does the negotiation and this is
// what it serves. `/why` gets `dist/why.md`, `/docs/tutorial` gets
// `dist/docs/tutorial.md`, `/` gets `dist/index.md`. The twins are also
// reachable directly by appending `.md`.
//
// It converts the BUILT HTML rather than the markdown sources, for the same
// reason llms-full.txt is generated: a hand-written second copy drifts, and
// the pages this repository authors (index, why, how-to, 404) have no markdown
// source at all — they are .astro. Converting what shipped means the twin says
// what the page says, by construction.
//
// Only the content region is converted: `[data-pagefind-body]` where a page
// declares one (already the site's own answer to "which part of this page is
// the content"), and `<main>` otherwise. Navigation, the header and footer,
// the skip link, scripts, styles and decorative markup never reach the output.
//
// Usage: node tools/gen-markdown.mjs [--check]
//   --check  report what would be written, write nothing, and fail if a page
//            produces no content (a layout change that silently empties the
//            twins would otherwise ship unnoticed).

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const CHECK = process.argv.includes("--check");

// Build output that is not a page.
const SKIP_DIRS = new Set(["_astro", "_worker.js", "pagefind", "fonts", "brand"]);

// Markup that carries no content: chrome and decoration.
//
// `data-pagefind-ignore` is deliberately NOT in this list. It means "keep this
// out of the search index", which is not the same as "this is not content": a
// block marked with it so that its repeated labels do not swamp a search
// result is still part of the page it sits on, and dropping the attribute
// takes that block out of the twin.
//
// Nothing this site builds carries the attribute today, and the rule stands so
// that the first block to do so still reaches the twin. The `#` heading anchors
// are the one piece of markup here that genuinely is not content, and the
// `.heading-anchor` entry below already removes them.
const DROP = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "nav",
  ".heading-anchor",
  '[aria-hidden="true"]',
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full, out);
    } else if (entry.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

/** dist/why/index.html -> why.md, dist/index.html -> index.md, dist/404.html -> 404.md */
function twinPath(file) {
  const rel = relative(DIST, file).split(sep).join("/");
  if (rel === "index.html") return "index.md";
  if (rel.endsWith("/index.html")) return rel.replace(/\/index\.html$/, ".md");
  return rel.replace(/\.html$/, ".md");
}

/**
 * The text of a code block. Shiki emits one <span class="line"> per line with
 * no newline between them (the site's CSS breaks lines with display:block), so
 * textContent alone would return the whole block as a single line.
 */
function codeText(el) {
  const lines = el.querySelectorAll("span.line");
  if (lines.length) return [...lines].map((l) => l.textContent).join("\n");
  return el.textContent ?? "";
}

function fence(code, lang = "") {
  const body = code.replace(/\s+$/, "");
  // A fence must be longer than any backtick run inside it.
  const longest = Math.max(0, ...[...body.matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = "`".repeat(Math.max(3, longest + 1));
  return `${ticks}${lang}\n${body}\n${ticks}`;
}

function makeTurndown() {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
    strongDelimiter: "**",
    hr: "---",
    linkStyle: "inlined",
  });
  td.use(gfm);

  // Code blocks, with the language Astro's Shiki recorded on the <pre>.
  td.addRule("shiki", {
    filter: (node) => node.nodeName === "PRE",
    replacement: (_content, node) =>
      "\n\n" + fence(codeText(node), node.getAttribute("data-language") ?? "") + "\n\n",
  });

  return td;
}

function frontmatter(fields) {
  const escape = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const lines = Object.entries(fields)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${escape(v)}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

const td = makeTurndown();
const files = walk(DIST).sort();
const problems = [];
let written = 0;

// A build that produced no pages is a broken build, not an empty site. Without
// this the run prints zero twins and exits 0, and a twin generator that
// silently emits nothing is what this whole file exists to prevent.
if (files.length === 0) {
  console.error(`  no built pages under ${DIST}`);
  process.exit(1);
}

for (const file of files) {
  const { document } = parseHTML(readFileSync(file, "utf8"));

  for (const selector of DROP) {
    for (const el of document.querySelectorAll(selector)) el.remove();
  }

  const region =
    document.querySelector("[data-pagefind-body]") ??
    document.querySelector("main") ??
    document.querySelector("body");

  const rel = twinPath(file);
  if (!region) {
    problems.push(`${rel}: no [data-pagefind-body], <main> or <body> to convert`);
    continue;
  }

  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  const title = document.querySelector("title")?.textContent?.trim();
  const description = document.querySelector('meta[name="description"]')?.getAttribute("content");

  // Site-relative links are useless to something reading the markdown out of
  // band, so resolve them against the page's own canonical URL.
  const origin = canonical ? new URL(canonical).origin : "https://jostraca.dev";
  for (const [selector, attribute] of [
    ["a[href]", "href"],
    ["img[src]", "src"],
  ]) {
    for (const el of region.querySelectorAll(selector)) {
      const value = el.getAttribute(attribute);
      if (value && value.startsWith("/") && !value.startsWith("//")) {
        el.setAttribute(attribute, origin + value);
      }
    }
  }

  let body = td
    .turndown(region.innerHTML)
    // Layout markup leaves whitespace-only lines behind.
    .replace(/^[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!body) {
    problems.push(`${rel}: converted to nothing`);
    continue;
  }

  // Every twin carries a top-level heading. Not every page opens with one: a
  // page can lead with an eyebrow line, or hold its only <h1> inside markup
  // that converts to something other than a document title. The <title> is the
  // page's own name plus the suffix Base.astro appends for the browser tab
  // ("How-to guides · Jostraca"). Strip it ONCE and use the result for both the
  // body heading and the frontmatter.
  //
  // Why the frontmatter cannot keep the raw title: the twin would open by
  // naming the site twice to a reader that had already asked for this site by
  // URL, and the `# heading` immediately below it, which does get the stripped
  // name, would disagree with it. One of the two would be wrong, and it would
  // be the one an agent parses first.
  const name = title ? title.replace(/\s+[·—]\s+Jostraca$/, "").trim() : title;

  if (name) {
    const firstHeading = body.split("\n").findIndex((l) => l.startsWith("# "));
    if (body.startsWith(`${name}\n`)) {
      body = `# ${body}`; // the page opens with its own name, unmarked
    } else if (firstHeading === -1 || firstHeading > 4) {
      body = `# ${name}\n\n${body}`;
    }
  }

  const out = frontmatter({ title: name, description, source: canonical }) + body + "\n";

  if (!CHECK) writeFileSync(join(DIST, rel), out);
  written++;
}

if (problems.length) {
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`  markdown twins: ${written} page(s)${CHECK ? " (check only)" : ""}`);
