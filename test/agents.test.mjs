// The agent-readiness surfaces, against the real build.
//
// These are the files an automated caller reads before it reads anything
// else: the OpenAPI description of what this site answers, the JSON-LD that
// says what the site *is*, and the trust pages a crawler checks before
// recommending a project. None of them is exercised by looking at the site,
// and all of them fail silently — a spec that enumerates a page which does
// not exist still parses, still validates, and still sends an agent to a 404.
//
// The enumeration check below exists because that is exactly what happened:
// the first draft of openapi.json listed `docs/index` and `how-to/index`,
// because `/docs/` twins to `/docs.md`, not `/docs/index.md`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import worker, { ENTRY_POINTS } from "../src/worker.ts";
import { makeAssets } from "./assets.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const built = existsSync(DIST);
const skip = built ? false : "no dist/ — run npm run build";

const read = (p) => readFileSync(join(DIST, p), "utf8");
const html = (p) => read(p);

/** The JSON-LD graph on a built page. */
function graphOf(page) {
  const blocks = [
    ...html(page).matchAll(
      /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
    ),
  ];
  assert.equal(blocks.length, 1, `${page}: expected exactly one ld+json block`);
  return JSON.parse(blocks[0][1]);
}

const meta = (source, property) =>
  new RegExp(`<meta property="${property}" content="([^"]*)"`).exec(source)?.[1];

test("openapi.json is a well-formed 3.1 document", { skip }, () => {
  const spec = JSON.parse(read("openapi.json"));
  assert.equal(spec.openapi, "3.1.0");
  assert.ok(spec.info.title && spec.info.version, "info needs a title and version");
  assert.ok(spec.servers?.[0]?.url.startsWith("https://"), "an absolute server URL");
  assert.ok(0 < Object.keys(spec.paths).length, "no paths described");
});

test("every operation is callable by an agent", { skip }, () => {
  const spec = JSON.parse(read("openapi.json"));
  const ops = Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(item).map(([method, op]) => ({ path, method, ...op })),
  );

  // Function calling needs all four of these on every operation; an agent
  // cannot choose between two operations that share an id or describe nothing.
  const ids = ops.map((o) => o.operationId);
  assert.equal(new Set(ids).size, ids.length, `duplicate operationId: ${ids}`);
  for (const op of ops) {
    const where = `${op.method.toUpperCase()} ${op.path}`;
    assert.ok(op.operationId, `${where}: no operationId`);
    assert.ok(/^[a-z][A-Za-z0-9]*$/.test(op.operationId), `${where}: odd operationId`);
    assert.ok(20 < (op.description ?? "").length, `${where}: description too thin`);
    assert.ok(op.summary, `${where}: no summary`);
    assert.ok(Object.keys(op.responses ?? {}).length, `${where}: no responses`);
    for (const [code, res] of Object.entries(op.responses)) {
      assert.ok(res.description, `${where} ${code}: response needs a description`);
      assert.ok(res.content, `${where} ${code}: response needs a content type`);
    }
    for (const param of op.parameters ?? []) {
      assert.ok(param.description, `${where}: parameter ${param.name} undescribed`);
      assert.ok(param.schema?.type, `${where}: parameter ${param.name} untyped`);
    }
  }
});

test("every $ref in the spec resolves", { skip }, () => {
  const spec = JSON.parse(read("openapi.json"));
  const refs = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (typeof node.$ref === "string") refs.push(node.$ref);
    for (const value of Object.values(node)) walk(value);
  };
  walk(spec);
  assert.ok(0 < refs.length, "the spec uses no shared schemas at all");
  for (const ref of refs) {
    const target = ref.replace(/^#\//, "").split("/");
    let node = spec;
    for (const key of target) node = node?.[key];
    assert.ok(node, `dangling $ref: ${ref}`);
  }
});

test("every page the spec enumerates actually answers", { skip }, () => {
  const spec = JSON.parse(read("openapi.json"));

  const twins = spec.paths["/{page}.md"].get.parameters[0].schema.enum;
  assert.ok(10 < twins.length, "suspiciously few markdown twins enumerated");
  for (const page of twins) {
    assert.ok(existsSync(join(DIST, `${page}.md`)), `spec lists ${page}.md — it does not exist`);
  }

  const pages = spec.paths["/{page}"].get.parameters[0].schema.enum;
  for (const page of pages) {
    assert.ok(
      existsSync(join(DIST, page, "index.html")),
      `spec lists /${page} — it does not exist`,
    );
  }

  // The other direction: a twin on disk the spec forgot is a page an agent
  // will never be told about.
  const listed = new Set(twins);
  for (const entry of ["index", "why", "about", "contact", "privacy", "docs", "how-to"]) {
    assert.ok(listed.has(entry), `${entry}.md exists but the spec omits it`);
  }
});

test("the spec's page list and the built twins agree exactly", { skip }, () => {
  // The one-directional check above catches a spec that points at a 404. It
  // cannot catch the opposite, and that is what actually happened on the
  // sibling site: one enum omitted a published grammar file, another omitted
  // 121 pages. Both were invisible to every check except this one.
  const spec = JSON.parse(read("openapi.json"));
  const listed = [...spec.paths["/{page}.md"].get.parameters[0].schema.enum].sort();

  const twins = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${prefix}${entry.name}/`);
      else if (entry.name.endsWith(".md")) twins.push(prefix + entry.name.replace(/\.md$/, ""));
    }
  };
  walk(DIST, "");

  // 404 is the error page's own twin, not a page of the site.
  const built = twins.filter((t) => t !== "404").sort();
  assert.deepEqual(listed, built, "openapi.json and the built markdown twins disagree");
});

test("the homepage publishes a JSON-LD identity", { skip }, () => {
  const graph = graphOf("index.html");
  assert.equal(graph["@context"], "https://schema.org");
  const types = graph["@graph"].map((n) => [].concat(n["@type"]));

  const org = graph["@graph"].find((n) => n["@type"] === "Organization");
  const site = graph["@graph"].find((n) => n["@type"] === "WebSite");
  const app = graph["@graph"].find((n) => types.flat().includes("SoftwareApplication") && n.softwareVersion);
  assert.ok(org && site && app, "home needs Organization, WebSite and the product node");

  for (const node of [org, site, app]) {
    assert.ok(node.name, "every node needs a name");
    assert.ok(node.url ?? node["@id"], "every node needs a url or @id");
  }
  assert.ok(app.description?.length > 40, "the product node needs a real description");
  assert.ok(app.offers, "an agent asking 'what does it cost' reads offers");
  assert.ok(app.author?.name, "attribution");
  assert.ok(2 <= org.sameAs.length, "sameAs is how an entity is resolved elsewhere");
  assert.ok(org.contactPoint?.[0]?.url, "Organization needs a reachable contactPoint");

  // Deliberate absences, pinned so nobody "completes" the schema by inventing
  // them. This is an open source project: there is no switchboard and no
  // office, and a fabricated address is worse than a missing one.
  assert.equal(org.contactPoint[0].telephone, undefined, "no invented phone number");
  assert.equal(org.address, undefined, "no invented postal address");
});

test("inner pages carry identity but not the product node", { skip }, () => {
  const graph = graphOf("why/index.html");
  const types = graph["@graph"].map((n) => n["@type"]);
  assert.deepEqual(types, ["Organization", "WebSite"]);
});

test("the four metadata signals are on every page", { skip }, () => {
  for (const page of ["index.html", "why/index.html", "about/index.html", "docs/tutorial/index.html"]) {
    const source = html(page);
    assert.match(source, /<html lang="en"/, `${page}: no html lang`);
    assert.match(source, /<link rel="canonical" href="https:\/\//, `${page}: no canonical`);
    assert.ok(meta(source, "og:type"), `${page}: no og:type`);
    const image = meta(source, "og:image");
    assert.ok(image?.startsWith("https://"), `${page}: og:image must be absolute`);
  }
});

test("the og:image the pages promise exists and is the right size", { skip }, () => {
  const source = html("index.html");
  const image = meta(source, "og:image");
  const file = join(DIST, new URL(image).pathname);
  assert.ok(existsSync(file), `og:image ${image} is not in the build`);

  // PNG header: width and height are big-endian uint32 at bytes 16 and 20.
  const bytes = readFileSync(file);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.equal(width, Number(meta(source, "og:image:width")));
  assert.equal(height, Number(meta(source, "og:image:height")));
  // Under 600px wide, X and LinkedIn fall back to a small square card.
  assert.ok(1200 <= width && 600 <= height, `og:image is ${width}x${height}`);
  assert.equal(meta(source, "twitter:card"), "summary_large_image");
});

test("the trust pages carry enough content to be believed", { skip }, () => {
  for (const page of ["about", "contact", "privacy"]) {
    const source = html(join(page, "index.html"));
    const body = /<main[^>]*>([\s\S]*?)<\/main>/.exec(source)?.[1] ?? "";
    const words = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    // 500 is the threshold an agent-readiness check uses; these are well over
    // it, and the assertion is here so a future trim cannot quietly go under.
    assert.ok(500 <= words.length, `/${page} has only ${words.length} characters`);
    assert.ok(existsSync(join(DIST, `${page}.md`)), `/${page} has no markdown twin`);
  }
});

test("llms.txt tells an agent when to reach for Jostraca", { skip }, () => {
  const index = read("llms.txt");
  assert.match(index, /##\s*When to use/i, "no when-to-use section");
  // Specific guidance, not marketing: it must name the fits and the misfits.
  assert.match(index, /Good fits:/);
  assert.match(index, /Poor fits/);
  assert.match(index, /npm install jostraca/, "an agent needs the install line");
  // And it must point at the machine surfaces, which is how they get found.
  for (const surface of ["/openapi.json", "/versions.json", "/llms-full.txt"]) {
    assert.ok(index.includes(surface), `llms.txt does not name ${surface}`);
  }
  for (const page of ["/about.md", "/contact.md", "/privacy.md"]) {
    assert.ok(index.includes(page), `llms.txt does not name ${page}`);
  }
});

test("the new routes are offered when a caller gets lost", { skip }, () => {
  const hrefs = ENTRY_POINTS.map(([href]) => href);
  for (const href of ["/openapi.json", "/about", "/contact"]) {
    assert.ok(hrefs.includes(href), `ENTRY_POINTS omits ${href}`);
  }
});

test("the spec answers cross-origin, and its 404 is JSON", { skip }, async () => {
  const env = { ASSETS: makeAssets(DIST) };
  const ctx = { waitUntil() {} };

  const ok = await worker.fetch(new Request("https://jostraca.org/openapi.json"), env, ctx);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), "*");
  const spec = JSON.parse(await ok.text());
  assert.equal(spec.openapi, "3.1.0");

  // A machine path must never answer a miss with HTML, whatever Accept says.
  const miss = await worker.fetch(
    new Request("https://jostraca.org/nope.json", { headers: { accept: "text/html" } }),
    env,
    ctx,
  );
  assert.equal(miss.status, 404);
  assert.match(miss.headers.get("content-type"), /application\/json/);
  const body = JSON.parse(await miss.text());
  assert.equal(body.error.status, 404);
  assert.ok(body.error.code, "an error an agent can branch on needs a code");
  assert.ok(body.error.resources["openapi.json"], "the error should name the spec");
});
