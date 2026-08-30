// The machine surfaces, against the real build.
//
// These are the routes this site exists to serve to something other than a
// person, and none of them is exercised by looking at the site. A /llms.txt
// that has quietly stopped listing half the documentation is invisible until
// an agent reads it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { ENTRY_POINTS } from "../src/worker.ts";
import { GROUPS } from "../tools/sync-docs.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const built = existsSync(DIST);
const skip = built ? false : "no dist/ — run npm run build";

const require = createRequire(import.meta.url);
const PIN = require("jostraca/package.json").version;

/**
 * A synced collection, read from the files the loader reads.
 *
 * The surfaces are generated from the content collections, so checking them
 * against the collection's own source is the only comparison that can catch a
 * page dropped on the way out. Reading the built site against itself would
 * agree with whatever it did.
 */
function collection(name) {
  const dir = join(ROOT, "src/content", name);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"))
    .map((file) => {
      const text = readFileSync(join(dir, file), "utf8");
      const field = (key) => new RegExp(`^${key}:\\s*"(.*)"$`, "m").exec(text)?.[1];
      return {
        id: file.replace(/\.mdx?$/, ""),
        title: field("title"),
        description: field("description"),
        group: field("group"),
        source: field("source"),
      };
    });
}

const docs = collection("docs");
const howto = collection("howto");

test("the documentation set is synced", () => {
  // Every test below this one is about what the surfaces made of the
  // documentation. With no documentation they all pass and none of them
  // means anything, so the emptiness is the failure to report.
  assert.ok(0 < docs.length, "src/content/docs is empty — run npm run sync-docs");
  assert.ok(0 < howto.length, "src/content/howto is empty — run npm run sync-docs");
  for (const page of [...docs, ...howto]) {
    assert.ok(page.title, `${page.id} has no title`);
    assert.ok(page.description, `${page.id} has no description`);
    assert.ok(page.source, `${page.id} does not name the file it was generated from`);
  }
});

// ── what the build actually produced ──────────────────────────────────────

test("every 404 entry point is a page the build produced", { skip }, () => {
  // A 404 that offers a route which 404s in turn is worse than one that
  // offers nothing at all.
  for (const [href] of ENTRY_POINTS) {
    const candidates = [
      join(DIST, href.replace(/^\//, "")),
      join(DIST, href.replace(/^\//, ""), "index.html"),
    ];
    assert.ok(
      candidates.some((c) => existsSync(c)),
      `404 offers ${href}, which the build did not produce`,
    );
  }
});

/** The site-relative targets of the markdown links in a generated file. */
function linkPaths(text) {
  return [...text.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => new URL(m[1]).pathname);
}

/**
 * One `## ` section of a generated markdown document, heading excluded.
 *
 * The index sections are what must match the collections exactly. Prose
 * elsewhere in llms.txt is free to link a page as a cross-reference -- the
 * when-to-use section points at the tutorial -- and scanning the whole file
 * would read that as the tutorial being listed twice.
 */
function section(text, heading) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === heading);
  assert.ok(-1 !== start, `llms.txt has no ${heading} section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (-1 === end ? rest : rest.slice(0, end)).join("\n");
}

test("llms.txt indexes every documentation page and every guide", { skip }, () => {
  const text = readFileSync(join(DIST, "llms.txt"), "utf8");
  const lines = text.split("\n");

  // llmstxt.org: an H1 naming the site, then a blockquote summarising it.
  assert.match(lines[0], /^# \S/, "llms.txt does not open with the site's name");
  assert.ok(
    lines.some((l) => l.startsWith("> ")),
    "llms.txt carries no summary blockquote",
  );

  const listed = (prefix, heading) =>
    linkPaths(section(text, heading))
      .filter((p) => p === `${prefix}.md` || p.startsWith(`${prefix}/`))
      .map((p) => (p === `${prefix}.md` ? "index" : p.slice(prefix.length + 1).replace(/\.md$/, "")))
      .sort();

  // Both directions: a page missing from the index is a page an agent will
  // not find, and an index entry with no page behind it is a 404 the site
  // handed out itself.
  assert.deepEqual(
    listed("/docs", "## Documentation"),
    docs.map((d) => d.id).sort(),
    "llms.txt and the docs collection disagree",
  );
  assert.deepEqual(
    listed("/how-to", "## How-to guides"),
    howto.map((g) => g.id).sort(),
    "llms.txt and the guides disagree",
  );

  // The index is a list of links plus their descriptions; the pages
  // themselves are /llms-full.txt.
  for (const page of [...docs, ...howto]) {
    assert.ok(text.includes(page.title), `llms.txt does not name ${page.id}`);
  }
});

test("llms-full.txt carries every page and no routing metadata", { skip }, () => {
  const full = readFileSync(join(DIST, "llms-full.txt"), "utf8");
  for (const page of [...docs, ...howto]) {
    assert.ok(full.includes(`# ${page.title}`), `llms-full.txt is missing ${page.title}`);
  }
  // The synced pages carry a generated banner and frontmatter; the corpus is
  // content, so neither belongs in it.
  assert.ok(!full.includes("GENERATED by tools/sync-docs.mjs"), "the do-not-edit banner leaked");
  assert.ok(!/^source: "/m.test(full), "frontmatter leaked into the corpus");
});

test("versions.json states the pin and the size of every surface", { skip }, () => {
  const v = JSON.parse(readFileSync(join(DIST, "versions.json"), "utf8"));
  // The pin is one fact: src/consts.ts re-exports it from the installed
  // package, and this reads the same package rather than a copy of the number.
  assert.equal(v.generator.version, PIN);
  assert.match(v.generator.version, /^\d+\.\d+\.\d+$/);
  assert.equal(v.generator.npm, "jostraca");
  assert.equal(v.generator.go_module, "github.com/jostraca/jostraca/go");
  assert.equal(v.surfaces.docs.count, docs.length);
  assert.equal(v.surfaces.howto.count, howto.length);
});

test("robots.txt points a crawler at the machine-readable index", { skip }, () => {
  // A crawler that finds llms.txt does not have to render every page of HTML
  // to learn what the site holds, which is the only reason this file says
  // anything beyond "allow".
  const robots = readFileSync(join(DIST, "robots.txt"), "utf8");
  assert.match(robots, /^Sitemap: https?:\/\/\S+\/sitemap-index\.xml$/m);
  assert.ok(robots.includes("/llms.txt"), "robots.txt does not mention /llms.txt");
  assert.ok(existsSync(join(DIST, "sitemap-index.xml")), "robots.txt names a sitemap that is not there");
});

// ── the how-to taxonomy, which three files have to agree about ────────────

test("the how-to groups agree across the site and the sync", () => {
  // consts.ts owns the display names and the order, content.config.ts refuses
  // a guide declaring anything else, and the sync checks the frontmatter it
  // writes. A slug in one and not the others is not a type error anywhere: a
  // guide in an unknown group sorts ahead of every other guide in /llms.txt
  // and lands in no section on /how-to.
  const consts = readFileSync(join(ROOT, "src/consts.ts"), "utf8");
  const block = /export const HOWTO_GROUPS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(consts);
  assert.ok(block, "src/consts.ts no longer declares a HOWTO_GROUPS array this test can read");
  const fromConsts = [...block[1].matchAll(/\bslug:\s*"([a-z-]+)"/g)].map((m) => m[1]);

  const config = readFileSync(join(ROOT, "src/content.config.ts"), "utf8");
  const enumeration = /group:\s*z\.enum\(\[([\s\S]*?)\]\)/.exec(config);
  assert.ok(enumeration, "src/content.config.ts no longer declares a group enum this test can read");
  const fromSchema = [...enumeration[1].matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);

  assert.deepEqual([...fromConsts].sort(), [...GROUPS].sort(), "HOWTO_GROUPS and the sync disagree");
  assert.deepEqual([...fromSchema].sort(), [...GROUPS].sort(), "the group enum and the sync disagree");

  for (const guide of howto) {
    assert.ok(GROUPS.includes(guide.group), `${guide.id} declares an unknown group: ${guide.group}`);
  }
});
