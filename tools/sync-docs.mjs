// Sync the documentation set from the generator repository into this one.
//
// THE SITE RENDERS THE DOCS; IT DOES NOT AUTHOR THEM. Every page under
// src/content/docs/ and src/content/howto/ is generated from
// jostraca/jostraca's docs/*.md and docs/how-to/*.md, and committed
// here. Nothing in those directories is edited by hand — an edit
// belongs upstream, where `ts/test/docs.test.ts` executes every tagged
// fence against the built package on each `make test`. A hand-written
// second copy on a website inherits none of that and drifts from it
// silently.
//
// Generated AND committed, because the source cannot be imported: the
// `jostraca` tarball ships `src`, `dist`, `gen` and `LICENSE`, and not
// `docs/`. So the build stays a plain `npm ci && npm run build` against a
// clone of this repository alone, and staleness is caught by a gate instead
// of by a reader.
//
//   node tools/sync-docs.mjs --apply    rewrite the synced content from ../jostraca
//   node tools/sync-docs.mjs --check    fail if what is committed is stale
//   node tools/sync-docs.mjs            same as --check, but never fails
//
// The checkout is ../jostraca, beside this repository. JOSTRACA_REPO
// overrides it.
//
// --check says nothing when the sibling checkout is absent, so it is inert in
// a CI job or a Cloudflare build that clones only this repository. It is a
// contributor-side gate.

import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname, resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, "..");

const REPO = "https://github.com/jostraca/jostraca";
// The generator's default branch is `main`. It was `master`, and GitHub still
// 302s the old name, so the stale constant kept working and kept being wrong.
//
// And GitHub serves a directory under /tree/, not /blob/: a /blob/ URL for
// `ts/` or `test/spec/` renders an error page rather than a listing. The
// upstream index links three such directories, so this is not hypothetical.
const BLOB = `${REPO}/blob/main/`;
const TREE = `${REPO}/tree/main/`;

/**
 * The pages this site renders, in sidebar order.
 *
 * `src` and `slug` decide the route; `section` and `order` decide where it
 * sits in the sidebar; `description` is the meta description and the line the
 * index and llms.txt show. Title is NOT here — it is the page's own first
 * H1, lifted out of the body so the layout can set it and the page cannot
 * carry two.
 *
 * The list is an explicit manifest rather than a directory scan: a page that
 * goes missing upstream must fail the sync, not silently narrow the site.
 * These seven files are the set `ts/test/docs.test.ts` names; that suite
 * skips one it does not find on disk, and this sync does not.
 */
const PAGES = [
  {
    src: "index.md",
    slug: "index",
    section: "Start",
    order: 10,
    description:
      "What Jostraca is, how its documentation is organised, and the smallest generator that writes a file.",
  },
  {
    src: "tutorial.md",
    slug: "tutorial",
    section: "Tutorial",
    order: 20,
    description:
      "Build a generator from nothing: declare a file tree, write it, then run it again over a file you edited by hand.",
  },
  {
    src: "reference-components.md",
    slug: "reference-components",
    section: "Reference",
    order: 30,
    description:
      "Every component and every prop: Project, Folder, File, Content, Line, Fragment, Slot, Inject, Copy, List and None.",
  },
  {
    src: "reference-options.md",
    slug: "reference-options",
    section: "Reference",
    order: 40,
    description:
      "Every option the factory and generate() take, and every existing-file mode: write, preserve, present, diff and merge.",
  },
  {
    src: "reference-utilities.md",
    slug: "reference-utilities",
    section: "Reference",
    order: 45,
    description:
      "The helpers the package exports beside the components: name casing, template substitution, deep merge, iteration and the binary-content tests.",
  },
  {
    src: "reference-go.md",
    slug: "reference-go",
    section: "Reference",
    order: 50,
    description:
      "The Go port: its API, the components it implements, and where it differs from the TypeScript original.",
  },
  {
    src: "explanation.md",
    slug: "explanation",
    section: "Understanding",
    order: 60,
    description:
      "Why the generator has a define phase and a build phase, what that split buys on the second run, and the trade-offs each existing-file mode makes.",
  },
];

/**
 * Sidebar section order, and the four the `docs` collection's schema admits.
 * A page filed under anything else is a sync failure rather than a page the
 * sidebar quietly drops.
 */
export const SECTIONS = ["Start", "Tutorial", "Reference", "Understanding"];

/**
 * The how-to group taxonomy. The same seven slugs are in `HOWTO_GROUPS` in
 * src/consts.ts, which owns their display names, blurbs and order, and in
 * upstream's `ts/test/docs.test.ts`. A guide declaring anything else fails
 * here, in the content-collection schema, and in that suite.
 */
export const GROUPS = ["install", "compose", "templates", "reuse", "regenerate", "files", "embed"];

/**
 * The site route for a repository path, or null where this site renders no
 * such page.
 *
 * The documentation pages come from the manifest. The how-to routes are
 * derived from the path shape instead, because the guide set IS the directory
 * scan below — every docs/how-to/<slug>.md is a page, and README.md is the
 * index this repository authors at /how-to. Callers reach this only after the
 * existence check, so a match here is a file that is really there.
 */
function routeFor(repoPath) {
  const page = PAGES.find((p) => `docs/${p.src}` === repoPath);
  if (page) return page.slug === "index" ? "/docs" : `/docs/${page.slug}`;
  if (repoPath === "docs/how-to/README.md") return "/how-to";
  const guide = /^docs\/how-to\/([^/]+)\.md$/.exec(repoPath);
  return guide ? `/how-to/${guide[1]}` : null;
}

/**
 * The heading ids a markdown document will have once rendered.
 *
 * The same slug rule rehype-slug applies: take the heading text, lowercase
 * it, drop anything that is not a word character, space or hyphen, and turn
 * runs of space into hyphens, disambiguating repeats with a numeric suffix.
 * A code span contributes its text, which is the case that matters here:
 * `## \`isbinext\` and \`isbincontent\`` becomes `isbinext-and-isbincontent`,
 * so a link written to `#isbinext` resolves to nothing at all.
 */
function headingIds(markdown) {
  const ids = new Set();
  const seen = new Map();
  for (const line of markdown.split("\n")) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const base = m[2]
      .replace(/`/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    ids.add(n === 0 ? base : `${base}-${n}`);
  }
  return ids;
}


/** Split a link target into its path and its `#fragment` (if any). */
function splitHash(target) {
  const i = target.indexOf("#");
  return i === -1 ? [target, ""] : [target.slice(0, i), target.slice(i)];
}

/**
 * Rewrite one markdown link target found in docs/<file>.
 *
 * Targets are RESOLVED rather than prefix-matched: the target is joined onto
 * `docs/` and normalised, which gives the path relative to the repository
 * root. That one step handles `tutorial.md`, `./x.md`, `../ts/src/jostraca.ts`
 * and the redundant-but-valid `../docs/how-to/README.md` identically, where a
 * list of string prefixes handled the first three and threw on the fourth.
 *
 * The resolved path is then checked THREE ways, and each failure is a sync
 * failure rather than a warning, because a link that silently stops resolving
 * is exactly what the rewrite exists to prevent.
 *
 *   1. it must not escape the repository root;
 *   2. it must exist on disk in the generator checkout;
 *   3. it becomes a site route if this site renders it, and an absolute
 *      repository URL otherwise.
 *
 * Step 2 is a second opinion rather than the only one — upstream's own
 * docs.test.ts resolves every relative link too. It stays because this tool
 * must be right about the checkout in front of it, which is the one being
 * copied and is often mid-edit, and because a target that resolves upstream
 * still has to become something on a website.
 */
export function rewriteTarget(target, file, root, baseDir = "docs") {
  // Absolute, protocol-relative, mailto, a bare anchor, or site-absolute.
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(target)) return target;

  const [rawPath, hash] = splitHash(target);
  if (rawPath === "") return target;

  const path = decodeURIComponent(rawPath);
  const repoPath = posix.normalize(posix.join(baseDir, path));

  if (repoPath.startsWith("../")) {
    throw new Error(
      `sync-docs: link ${JSON.stringify(target)} in ${baseDir}/${file} escapes the repository root ` +
        `(resolves to ${repoPath}).`,
    );
  }

  if (root && !existsSync(join(root, repoPath))) {
    throw new Error(
      `sync-docs: broken link ${JSON.stringify(target)} in ${baseDir}/${file} — ` +
        `${repoPath} does not exist in ${root}.`,
    );
  }

  // A fragment has to name a heading that exists. Checking the path alone
  // lets `#isbinext` sail through when the heading is `isbinext-and-
  // isbincontent`, and the broken anchor is then committed as though the
  // link checker had approved it.
  if (hash && root && repoPath.endsWith(".md")) {
    const ids = headingIds(readFileSync(join(root, repoPath), "utf8"));
    const frag = decodeURIComponent(hash.slice(1));
    if (!ids.has(frag)) {
      throw new Error(
        `sync-docs: broken anchor ${JSON.stringify(target)} in ${baseDir}/${file} — ` +
          `${repoPath} has no heading with id ${JSON.stringify(frag)}.`,
      );
    }
  }

  // A sibling page this site renders.
  const route = routeFor(repoPath);
  if (route) return route + hash;

  // Anything else in the repository: link to the source of truth, as a blob
  // or a tree depending on which it is.
  const isDir = root
    ? statSync(join(root, repoPath)).isDirectory()
    : path.endsWith("/");
  return (isDir ? TREE : BLOB) + repoPath + hash;
}

/** YAML-safe double-quoted scalar. */
function yamlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * The label a rewritten link should carry.
 *
 * Upstream writes repository links as `[\`../ts/\`](../ts/)` — the text IS the
 * path, which is right in a checkout and meaningless on a website, where
 * "../ts/" is relative to nothing the reader can see. Where the text is a code
 * span holding exactly the target path, it is renormalised to the same
 * repository-relative path the href resolved to: `\`ts/\``.
 *
 * This is rendering, not rewriting. The text and the href state one fact, so
 * normalising the href and leaving the text would make the page disagree with
 * itself. Every other label is upstream's prose and is left exactly as
 * written — including on links to pages this site renders, where upstream
 * already writes a human label ("Tutorial", not "tutorial.md").
 */
function relabel(text, target, href) {
  if (!href.startsWith(BLOB)) return text;
  const bare = /^`(.+)`$/.exec(text);
  if (!bare || bare[1] !== target) return text;
  return "`" + href.slice(BLOB.length) + "`";
}

/**
 * Convert one upstream document into the page this site commits.
 *
 * The first H1 becomes the frontmatter title and is REMOVED from the body:
 * the layout renders the title, so leaving it in would give every page two.
 * Deriving it beats listing it in PAGES — a retitled document should not need
 * an edit here to stay correct.
 *
 * The `<!-- test: ... -->` directives that tell upstream's docs.test.ts which
 * fence to execute pass through untouched. Markdown renders an HTML comment
 * as nothing, so they cost the page nothing, and dropping them would make
 * this a lossy copy of a file the site claims to reproduce.
 */
export function convert(source, page, root, baseDir = "docs") {
  const lines = source.replace(/\r\n/g, "\n").split("\n");

  const h1 = lines.findIndex((l) => /^#\s+\S/.test(l));
  if (h1 === -1) {
    throw new Error(`sync-docs: ${baseDir}/${page.src} has no H1 to take a title from`);
  }
  const title = lines[h1].replace(/^#\s+/, "").trim();

  // Drop the H1 and any blank lines that immediately followed it.
  let rest = h1 + 1;
  while (rest < lines.length && lines[rest].trim() === "") rest++;
  let body = lines.slice(rest).join("\n").trimEnd();

  // Rewrite every inline markdown link target, and every reference
  // definition, outside of fenced code. A fence's contents are a document,
  // a command or a transcript — never a link this site should touch.
  body = mapOutsideFences(body, (chunk) =>
    chunk
      .replace(/\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (_m, text, target, title2) => {
        const href = rewriteTarget(target, page.src, root, baseDir);
        return `[${relabel(text, target, href)}](${href}${title2 ?? ""})`;
      })
      .replace(/^(\s*\[[^\]]+\]:\s*)(\S+)/gm, (_m, head, target) => {
        return head + rewriteTarget(target, page.src, root, baseDir);
      }),
  );

  const front = [
    "---",
    `title: ${yamlString(title)}`,
    `description: ${yamlString(page.description)}`,
    page.group ? `group: ${yamlString(page.group)}` : `section: ${yamlString(page.section)}`,
    `order: ${page.order}`,
    `source: ${yamlString(`${baseDir}/${page.src}`)}`,
    "---",
    "",
    "<!-- GENERATED by tools/sync-docs.mjs from jostraca/jostraca. Do not edit:",
    `     edit ${baseDir}/${page.src} upstream, then run \`npm run sync-docs\`. -->`,
    "",
  ].join("\n");

  return front + body + "\n";
}

/** Apply `fn` to the parts of `text` that are not inside a fenced block. */
function mapOutsideFences(text, fn) {
  const out = [];
  let fence = null;
  let buf = [];
  const flush = () => {
    if (buf.length) out.push(fn(buf.join("\n")));
    buf = [];
  };
  for (const line of text.split("\n")) {
    const m = /^(\s*)(`{3,}|~{3,})/.exec(line);
    if (fence === null && m) {
      flush();
      fence = m[2][0].repeat(3);
      out.push(line);
      continue;
    }
    if (fence !== null) {
      out.push(line);
      if (new RegExp(`^\\s*${fence[0]}{3,}\\s*$`).test(line)) fence = null;
      continue;
    }
    buf.push(line);
  }
  flush();
  return out.join("\n");
}

// ── how-to guides ─────────────────────────────────────────────────────────
//
// Each guide is authored upstream as docs/how-to/<slug>.md with its own YAML
// frontmatter (description, group, order) — the metadata lives beside the
// prose it describes, so a reordered or redescribed guide needs no edit here.
// That is also why the guides are SCANNED where PAGES is a manifest: a
// manifest here would carry nothing the file does not already carry, and
// would have to be edited every time a guide is added.

export function parseGuideFront(source, slug) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(source.replace(/\r\n/g, "\n"));
  if (!m) {
    throw new Error(`sync-docs: docs/how-to/${slug}.md has no frontmatter`);
  }
  const fields = {};
  for (const line of m[1].split("\n")) {
    const f = /^([a-z]+):\s*(.*)$/.exec(line.trim());
    if (f) fields[f[1]] = f[2].replace(/^"(.*)"$/, "$1");
  }
  for (const need of ["description", "group", "order"]) {
    if (!fields[need]) {
      throw new Error(`sync-docs: docs/how-to/${slug}.md frontmatter lacks ${need}`);
    }
  }
  const order = Number(fields.order);
  if (!Number.isFinite(order)) {
    throw new Error(`sync-docs: docs/how-to/${slug}.md order is not a number`);
  }
  return { body: source.replace(/\r\n/g, "\n").slice(m[0].length), fields, order };
}

function convertGuide(source, slug, root) {
  const { body, fields, order } = parseGuideFront(source, slug);
  if (!GROUPS.includes(fields.group)) {
    throw new Error(
      `sync-docs: docs/how-to/${slug}.md declares group ${JSON.stringify(fields.group)}, ` +
        `which is not one of the taxonomy: ${GROUPS.join(", ")}.`,
    );
  }
  return convert(
    body,
    { src: `${slug}.md`, description: fields.description, group: fields.group, order },
    root,
    "docs/how-to",
  );
}

/**
 * The guides upstream holds, by slug.
 *
 * README.md is the guides' own index and is not synced: /how-to is authored
 * here, from the collection itself. An empty or absent directory is a
 * failure — the scan may follow upstream, but it may not narrow the site to
 * nothing without saying so.
 */
function scanGuides(root) {
  const dir = join(root, "docs", "how-to");
  if (!existsSync(dir)) {
    throw new Error(`sync-docs: docs/how-to is missing from ${root}`);
  }
  const slugs = readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .map((f) => f.slice(0, -3))
    .sort();
  if (slugs.length === 0) {
    throw new Error(`sync-docs: docs/how-to in ${root} holds no guides`);
  }
  return slugs;
}

// ── driver ────────────────────────────────────────────────────────────────

/**
 * Everything this repository carries from the generator, as
 * site-relative path -> content.
 */
function collect(root) {
  const out = new Map();
  const read = (rel) => readFileSync(join(root, rel), "utf8");

  // Every gap in one run. The documentation set is written page by page, and
  // failing on the first absence means one run per missing file.
  const missing = PAGES.map((p) => `docs/${p.src}`).filter((rel) => !existsSync(join(root, rel)));
  if (missing.length) {
    throw new Error(
      `sync-docs: the manifest names ${missing.length} file(s) that ${root} does not have:\n` +
        missing.map((rel) => "  " + rel).join("\n"),
    );
  }

  for (const page of PAGES) {
    if (!SECTIONS.includes(page.section)) {
      throw new Error(
        `sync-docs: docs/${page.src} is filed under section ${JSON.stringify(page.section)}, ` +
          `which the sidebar does not list.`,
      );
    }
    out.set(`src/content/docs/${page.slug}.md`, convert(read(`docs/${page.src}`), page, root));
  }

  for (const slug of scanGuides(root)) {
    out.set(
      `src/content/howto/${slug}.md`,
      convertGuide(read(`docs/how-to/${slug}.md`), slug, root),
    );
  }

  return out;
}

/** Directories this sync owns entirely — anything else in them is stale. */
const OWNED = ["src/content/docs", "src/content/howto"];

function main(argv) {
  const apply = argv.includes("--apply");
  const check = argv.includes("--check");
  const root = resolve(process.env.JOSTRACA_REPO || join(SITE, "..", "jostraca"));

  if (!existsSync(join(root, "docs"))) {
    // The sibling is not checked out. Say so and succeed: a CI job or a
    // Cloudflare build that cloned only this repo has nothing to compare to,
    // and must not fail for it.
    console.log(`sync-docs: no generator checkout at ${root} — nothing to compare (ok)`);
    return 0;
  }

  let generated;
  try {
    generated = collect(root);
  } catch (err) {
    console.error(String(err.message ?? err));
    return 1;
  }

  if (apply) {
    for (const dir of OWNED) {
      const abs = join(SITE, dir);
      mkdirSync(abs, { recursive: true });
      for (const name of readdirSync(abs)) {
        if (!generated.has(`${dir}/${name}`)) rmSync(join(abs, name), { recursive: true });
      }
    }
    for (const [rel, text] of generated) {
      const abs = join(SITE, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
    }
    console.log(`sync-docs: wrote ${generated.size} file(s) from ${root}`);
    return 0;
  }

  const stale = [];
  for (const dir of OWNED) {
    const abs = join(SITE, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      if (!generated.has(`${dir}/${name}`)) stale.push(`${dir}/${name} (no longer synced)`);
    }
  }
  for (const [rel, text] of generated) {
    const abs = join(SITE, rel);
    if (!existsSync(abs)) stale.push(`${rel} (missing)`);
    else if (readFileSync(abs, "utf8") !== text) stale.push(`${rel} (differs)`);
  }

  if (stale.length === 0) {
    console.log(`sync-docs: ${generated.size} synced file(s) match ${root}`);
    return 0;
  }

  console.error(`sync-docs: the synced files are stale against ${root}:`);
  for (const s of stale) console.error("  " + s);
  console.error("\nRun `npm run sync-docs` and commit the result.");
  return check ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
