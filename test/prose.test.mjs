// The banned-phrase gate for AUTHORED pages.
//
// The style guide upstream is normative for every sentence written here, and
// until this file existed that was a review obligation with nothing behind
// it. Review is what failed: "the honest answer", "the corpus that keeps them
// honest" — two uses of a banned word, live on the site, found by a reader
// rather than by a gate. AGENTS.md said the guide applied; nothing checked
// that it did.
//
// SYNCED PAGES ARE NOT COVERED, deliberately. src/content/docs and
// src/content/howto come from the generator, where ts/test/docs.test.ts
// already runs this same list against them. A second gate on one fact is what
// the sync exists to prevent.
//
// The list itself is not written here either — test/banned.txt is synced from
// the generator's reject.txt, so the two repositories cannot drift apart on
// what is banned. `npm run check-sync` fails when the copy is stale.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const skip = existsSync(DIST) ? false : "no dist/ — run npm run build";

/**
 * The authored pages, as their markdown twins.
 *
 * Derived, not listed, so a page added tomorrow is covered tomorrow. The line
 * is DYNAMIC ROUTE vs static page, NOT top level vs subdirectory: the synced
 * content is rendered by src/pages/docs/[...slug].astro and
 * src/pages/how-to/[slug].astro, and a bracketed filename is what marks
 * those. Sitting beside the second of them is src/pages/how-to/index.astro,
 * which is authored prose — AGENTS.md names it in the authored set — and a
 * first version of this function that filtered on depth missed it, leaving
 * /how-to ungated on the very change that added the gate.
 *
 * An index maps to its directory's twin: how-to/index.astro renders /how-to,
 * whose twin is dist/how-to.md.
 */
function authored(dir = join(ROOT, "src", "pages"), prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...authored(join(dir, entry.name), rel));
      continue;
    }
    if (!entry.name.endsWith(".astro")) continue;
    if (entry.name.includes("[")) continue;
    const base = rel.replace(/\.astro$/, "");
    out.push((base.endsWith("/index") ? base.slice(0, -"/index".length) : base) + ".md");
  }
  return out.sort();
}

function banned() {
  return readFileSync(join(ROOT, "test", "banned.txt"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((pat) => [new RegExp(`\\b(?:${pat})\\b`, "gi"), pat]);
}

const FENCE_OPEN = /^(\s{0,3})(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/;

/** Fenced blocks blanked, not dropped, so line numbers still point at the file. */
function prose(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [...lines];
  for (let i = 0; i < lines.length; i++) {
    const fm = lines[i].match(FENCE_OPEN);
    if (!fm) continue;
    const f = fm[2];
    const closer = new RegExp("^\\s{0,3}" + f[0] + "{" + f.length + ",}[ \\t]*$");
    out[i] = "";
    let j = i + 1;
    for (; j < lines.length && !closer.test(lines[j]); j++) out[j] = "";
    if (j < lines.length) out[j] = "";
    i = j;
  }
  return out.join("\n").replace(/`[^`\n]*`/g, "");
}

/**
 * Paragraphs, joined for matching, with each piece's line number kept.
 *
 * Most of the list is multi-word and this prose wraps, so matching physical
 * lines would miss any phrase a line break happened to split. Upstream learned
 * that the expensive way; this file starts from the answer.
 */
function logical(text) {
  const out = [];
  let pieces = [];
  let starts = [];
  let lines = [];
  let at = 0;
  const flush = () => {
    if (pieces.length) out.push({ text: pieces.join(" "), starts, lines, pieces });
    pieces = [];
    starts = [];
    lines = [];
    at = 0;
  };
  text.split("\n").forEach((line, i) => {
    if (line.trim() === "") return flush();
    const piece = line.trim().replace(/\s+/g, " ");
    starts.push(at);
    lines.push(i + 1);
    pieces.push(piece);
    at += piece.length + 1;
  });
  flush();
  return out;
}

function at(para, index) {
  let k = 0;
  for (let n = 0; n < para.starts.length; n++) if (para.starts[n] <= index) k = n;
  return { line: para.lines[k], text: para.pieces[k] };
}

test("no banned phrases on authored pages", { skip }, () => {
  const pats = banned();
  assert.ok(pats.length > 0, "test/banned.txt is empty — run npm run sync-docs");

  const hits = [];
  for (const name of authored()) {
    const abs = join(DIST, name);
    // A missing twin is a hole in this gate, not a page to skip quietly.
    assert.ok(existsSync(abs), `dist/${name}: authored page has no markdown twin, so this gate cannot read it`);

    for (const para of logical(prose(readFileSync(abs, "utf8")))) {
      for (const [re, pat] of pats) {
        for (const m of para.text.matchAll(re)) {
          if (m.index == null) continue;
          const { line, text } = at(para, m.index);
          const hit = `${name}:${line} "${pat}": ${text}`;
          if (!hits.includes(hit)) hits.push(hit);
        }
      }
    }
  }

  assert.deepEqual(hits, [], `banned phrases on authored pages (docs/STYLE-GUIDE.md upstream):\n${hits.join("\n")}`);
});
