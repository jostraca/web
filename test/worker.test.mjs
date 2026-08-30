// The request Worker's pure logic, against the real dist/.
//
// The negotiation rules are the part of this site a machine caller depends on
// and a browser never exercises, so they get tested directly rather than
// discovered in production. Everything here is a pure function exported from
// src/worker.ts; the fetch handler itself needs a Workers runtime and is
// covered by `wrangler dev` in `npm run preview`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

// Node runs the TypeScript directly (native type stripping), so these are the
// real exported functions rather than a copy that could drift from them.
import worker, {
  parseAccept,
  quality,
  explicitQuality,
  wantsMarkdown,
  isMachinePath,
  errorFormat,
  markdownTwin,
  ENTRY_POINTS,
} from "../src/worker.ts";
import { makeAssets } from "./assets.mjs";

test("parseAccept reads q-values and ignores broken parameters", () => {
  assert.deepEqual(parseAccept("text/markdown;q=0.9, text/html"), [
    { type: "text", subtype: "markdown", q: 0.9 },
    { type: "text", subtype: "html", q: 1 },
  ]);
  assert.deepEqual(parseAccept(null), []);
  // A malformed parameter must not cost the caller its page.
  assert.equal(parseAccept("text/html;q=banana")[0].q, 1);
});

test("quality counts wildcards, explicitQuality does not", () => {
  const ranges = parseAccept("*/*");
  assert.equal(quality(ranges, "text/markdown"), 1);
  assert.equal(explicitQuality(ranges, "text/markdown"), 0);
});

test("a bare wildcard is not a request for markdown", () => {
  // curl sends `*/*`. It has not asked for markdown; it has said it will take
  // whatever the server thinks is right, and for a page that is HTML.
  assert.equal(wantsMarkdown("*/*"), false);
  assert.equal(wantsMarkdown(null), false);
  assert.equal(wantsMarkdown("text/markdown"), true);
  assert.equal(wantsMarkdown("text/markdown;q=0.9, text/html;q=1.0"), false);
  assert.equal(wantsMarkdown("text/markdown;q=1.0, text/html;q=0.9"), true);
});

test("the machine surface is prefix- and extension-based", () => {
  // /llms.txt and the sitemap are generated for machines and are still text a
  // person can read, so an error at either is negotiated like a page's.
  assert.equal(isMachinePath("/llms.txt"), false);
  assert.equal(isMachinePath("/sitemap-index.xml"), false);
  assert.equal(isMachinePath("/versions.json"), true);
  // The prefix rule is what makes a probe under /.well-known/ answer with an
  // error object rather than HTML, whether or not anything is published there.
  assert.equal(isMachinePath("/.well-known/whatever"), true);
});

test("errors are negotiated, and a caller that named nothing gets markdown", () => {
  assert.equal(errorFormat(null, "/nope"), "markdown");
  assert.equal(errorFormat("*/*", "/nope"), "markdown");
  assert.equal(errorFormat("text/html", "/nope"), "html");
  assert.equal(errorFormat("application/json", "/nope"), "json");
  // On the machine surface the Accept header does not get a vote.
  assert.equal(errorFormat("text/html", "/versions.json"), "json");
});

test("markdownTwin maps pages and refuses everything else", () => {
  assert.equal(markdownTwin("/"), "/index.md");
  assert.equal(markdownTwin("/docs"), "/docs.md");
  assert.equal(markdownTwin("/docs/tutorial/"), "/docs/tutorial.md");
  assert.equal(markdownTwin("/llms.txt"), null);
  assert.equal(markdownTwin("/_astro/x.css"), null);
  // RFC 8615: a .well-known file is a protocol document, not a page.
  assert.equal(markdownTwin("/.well-known/whatever"), null);
});

// ── against the real build ────────────────────────────────────────────────
//
// The tests above prove the rules. These prove the rules match what was
// actually built — a twin the Worker promises and the build did not write is
// a 406 in production and nothing here would otherwise notice.

const built = existsSync(DIST);

/** Build output that is not a page — the same set tools/gen-markdown.mjs skips. */
const NOT_PAGES = new Set(["_astro", "_worker.js", "pagefind", "fonts", "brand"]);

/** Every route the build produced a page for. */
function routes(dir = DIST, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!NOT_PAGES.has(entry)) routes(full, out);
    } else if (entry.endsWith(".html")) {
      const rel = relative(DIST, full).split(sep).join("/");
      const route =
        rel === "index.html"
          ? "/"
          : `/${rel.replace(/\/index\.html$/, "").replace(/\.html$/, "")}`;
      out.push(route);
    }
  }
  return out;
}

test("every page in dist has the markdown twin the Worker will serve", { skip: built ? false : "no dist/ — run npm run build" }, () => {
  // Read from the build rather than listed here. Most of this site's pages
  // are synced from the generator repository, so a list in this file would
  // need an edit for a page this repository does not author, and would be
  // wrong until someone made it.
  const pages = routes();
  assert.ok(0 < pages.length, "the build produced no pages");
  for (const page of pages) {
    const twin = markdownTwin(page);
    assert.ok(twin, `${page} should have a twin`);
    assert.ok(existsSync(join(DIST, twin)), `dist${twin} is missing (page ${page})`);
  }
});

test("the 404 twin carries the routes it offers", { skip: built ? false : "no dist/" }, () => {
  // The whole point of a twin is that an agent gets the same content. A
  // conversion that silently drops a page's internal links produces a file
  // that looks fine and is useless — and on this page the links are the only
  // reason to read it.
  const twin = readFileSync(join(DIST, "404.md"), "utf8");
  for (const [href] of ENTRY_POINTS) {
    assert.ok(twin.includes(href), `404.md lost its link to ${href}`);
  }
});

test("a twin's frontmatter title is the page's name, not the browser tab's", { skip: built ? false : "no dist/" }, () => {
  // The <title> carries the suffix Base.astro appends for the tab. A twin that
  // keeps it states the site's name twice to a reader that asked for this site
  // by URL.
  for (const page of routes()) {
    const twin = markdownTwin(page).replace(/^\//, "");
    const text = readFileSync(join(DIST, twin), "utf8");
    const front = /^---\n([\s\S]*?)\n---/.exec(text);
    assert.ok(front, `${twin} has no frontmatter`);

    const title = /^title:\s*"(.*)"$/m.exec(front[1])?.[1];
    assert.ok(title, `${twin} frontmatter has no title`);
    assert.doesNotMatch(
      title,
      /\s+[·—]\s+Jostraca$/,
      `${twin} frontmatter title still carries the site suffix: ${title}`,
    );

    // On a synced page the tab name and the heading are one fact: the layout
    // renders the frontmatter title as the H1. A twin where they disagree has
    // had one of them rewritten on the way out, and it is the frontmatter an
    // agent parses first. An authored page names itself twice on purpose —
    // /404's tab says "Not found" and its headline says more than that — so
    // the rule is only pinned where there is one source to disagree with.
    if (!/^\/(docs|how-to)(\/|$)/.test(page)) continue;
    const heading = /^# (.+)$/m.exec(text.slice(front[0].length))?.[1];
    if (heading) {
      assert.equal(heading, title, `${twin}: frontmatter title and body heading disagree`);
    }
  }
});

// ── the handler itself, against a dist-backed ASSETS stand-in ─────────────
//
// The rules above are pure functions; this is what a caller actually gets.
// makeAssets matches the two settings wrangler.json sets — auto-trailing-slash
// html handling, and `not_found_handling: "none"` so a miss is a bare 404 and
// the Worker owns what the caller sees.

const env = { ASSETS: makeAssets(DIST) };
const get = (path, headers = {}, method = "GET") =>
  worker.fetch(new Request(`https://jostraca.dev${path}`, { method, headers }), env);

test("www redirects to the apex, permanently", { skip: built ? false : "no dist/" }, async () => {
  const res = await worker.fetch(new Request("https://www.jostraca.dev/why"), env);
  assert.equal(res.status, 301);
  assert.equal(res.headers.get("location"), "https://jostraca.dev/why");
});

test("Accept: text/markdown serves the twin from the page's own URL", { skip: built ? false : "no dist/" }, async () => {
  const res = await get("/why", { accept: "text/markdown" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/markdown/);
  // Without Vary a CDN can hand the next agent the cached HTML.
  assert.match(res.headers.get("vary"), /Accept/);
  assert.equal(res.headers.get("content-location"), "/why.md");
  assert.match(await res.text(), /Jostraca/);
});

test("a browser gets HTML, via the asset server's trailing-slash redirect", { skip: built ? false : "no dist/" }, async () => {
  // Note the asymmetry, which is correct and worth pinning: a markdown caller
  // is answered at /why directly, because the Worker fetches /why.md itself.
  // An HTML caller goes through the asset server, which is configured
  // html_handling: "auto-trailing-slash" and redirects /why -> /why/.
  const hop = await get("/why", { accept: "text/html,application/xhtml+xml,*/*;q=0.8" });
  assert.equal(hop.status, 307);
  assert.equal(new URL(hop.headers.get("location"), "https://jostraca.dev").pathname, "/why/");

  const res = await get("/why/", { accept: "text/html,application/xhtml+xml,*/*;q=0.8" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/html/);
  assert.match(res.headers.get("vary"), /Accept/);
});

test("a careless Accept is disregarded rather than refused", { skip: built ? false : "no dist/" }, async () => {
  // RFC 9110 §12.5.1 permits this, and it is the right call for a docs site:
  // plenty of tooling sends application/json by default and wants the page.
  // A 406 here would refuse a page that exists to a caller that would happily
  // have read it.
  const res = await get("/why/", { accept: "application/json" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/html/);
});

test("an unknown path recovers, in the caller's own format", { skip: built ? false : "no dist/" }, async () => {
  const bare = await get("/nope");
  assert.equal(bare.status, 404);
  assert.match(bare.headers.get("content-type"), /^text\/markdown/);
  assert.match(await bare.text(), /\/llms\.txt/);

  const machine = await get("/nope.json");
  assert.equal(machine.status, 404);
  const body = await machine.json();
  assert.equal(body.error.code, "not_found");
  // An error a browser client cannot read cross-origin is no use at the
  // moment it is needed.
  assert.equal(machine.headers.get("access-control-allow-origin"), "*");

  const browser = await get("/nope", { accept: "text/html" });
  assert.equal(browser.status, 404);
  assert.match(browser.headers.get("content-type"), /^text\/html/);
});

test("the site is read-only, and says so in a shape a client can branch on", { skip: built ? false : "no dist/" }, async () => {
  const res = await get("/why", {}, "POST");
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "GET, HEAD, OPTIONS");
  assert.equal((await res.json()).error.code, "method_not_allowed");
});

test("public data answers cross-origin", { skip: built ? false : "no dist/" }, async () => {
  // /llms.txt and /versions.json exist to be read by a program running
  // somewhere else. Neither can carry a header of its own.
  for (const path of ["/llms.txt", "/versions.json"]) {
    const res = await get(path);
    assert.equal(res.status, 200, `${path} was not served`);
    assert.equal(res.headers.get("access-control-allow-origin"), "*", path);
  }
});
