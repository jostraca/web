// Every example on a SITE-AUTHORED page is executed against the pinned
// `jostraca` package, and the files it wrote are compared to the result the
// page states.
//
// The generator repository already holds its own documentation this way:
// ts/test/docs.test.ts runs every tagged fence in docs/ and checks the file
// listing under it. This is the same rule applied to the pages that have no
// upstream counterpart, which are the only pages this repository authors.
//
// SYNCED PAGES ARE DELIBERATELY NOT COVERED HERE. They are already held by
// that upstream suite, on the same content, and running it again would put a
// second gate on one fact — which is what the sync exists to prevent. The
// absence is a decision, not an oversight; without this note it reads like a
// gap someone forgot to close.
//
// ── the convention ────────────────────────────────────────────────────────
//
// An authored page holds its examples in template literals rather than
// markdown fences, so the convention is a pair of `const` bindings in the
// page's frontmatter: `EXAMPLE` and `RESULT`, or `EXAMPLE_<NAME>` and
// `RESULT_<NAME>` where a page shows more than one. That keeps a generator
// and the output it claims adjacent in the file, and makes both extractable.
//
// EXAMPLE is a module, run as written: named imports from `jostraca` and
// `node:fs`, top-level await, nothing else. An import of anything else, or in
// any other form, fails the test rather than being quietly dropped.
//
// RESULT is a listing of what the run left behind. A path at column 0, then
// that file's lines indented by two spaces:
//
//     out/acme/package.json
//       { "name": "acme" }
//     out/acme/src/index.js
//       console.log("acme")
//
// Paths are relative to the working directory, which is where the example's
// own `folder: './out'` puts them. The listing is complete: a file the run
// wrote and the page did not list fails, and so does a file the page listed
// and the run did not write. Jostraca's own `.jostraca/` bookkeeping is
// excluded, the same exclusion the `test: out` directive makes upstream — it
// holds the baseline and a timestamp, and no page is describing it.
//
// A file's final newline is not stated; every other byte is. An empty file is
// listed with no indented lines under it.
//
// ── the run is in memory ──────────────────────────────────────────────────
//
// `mem: true` is forced onto every `Jostraca()` an example constructs, so a
// page example cannot write into the checkout, and the volume it produced is
// the thing compared. `node:fs` is handed that same volume: an example that
// shows a second generate has to simulate the hand edit in between, and an
// edit written to the real filesystem is not there when the generator looks.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const jostraca = require("jostraca");

/** Every .astro file under src/pages — the pages this repo authors itself. */
function pages(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...pages(path));
    else if (name.endsWith(".astro")) out.push(path);
  }
  return out;
}

/**
 * The EXAMPLE/RESULT pairs a page declares, keyed by name.
 *
 * The template literal is evaluated rather than read as raw file text, so
 * that what is tested is the string the page renders. An example writing a
 * newline into a generated file spells it `\\n` in the page source, and the
 * raw text would hand the generator a backslash.
 */
function examples(source, where) {
  const found = new Map();
  const re = /const\s+(EXAMPLE|RESULT|INPUT)(?:_([A-Za-z0-9_]+))?\s*=\s*(`[\s\S]*?`)/g;
  let m;
  let read = 0;
  while ((m = re.exec(source)) !== null) {
    const [, kind, name = "", literal] = m;
    const key = name || "default";
    const entry = found.get(key) ?? {};
    const binding = name === "" ? kind : `${kind}_${name}`;
    try {
      entry[kind.toLowerCase()] = new Function(`return ${literal}`)();
    } catch (err) {
      throw new Error(`${where}: ${binding} is not a literal string: ${err.message}`);
    }
    found.set(key, entry);
    read++;
  }
  // A binding written any other way (a quoted string, a concatenation) is
  // invisible to the regex above, and an example nobody runs is worse than no
  // example at all.
  const declared = [...source.matchAll(/const\s+(?:EXAMPLE|RESULT|INPUT)(?:_[A-Za-z0-9_]+)?\s*=/g)].length;
  if (declared !== read) {
    throw new Error(
      `${where}: ${declared} EXAMPLE/RESULT/INPUT bindings, ${read} of them template literals this ` +
        "suite can read; write every one as a backtick literal",
    );
  }
  return found;
}

// ── running an example ────────────────────────────────────────────────────

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const IMPORT = /^[ \t]*import\b.*$/gm;
const NAMED = /^[ \t]*import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?[ \t]*$/;

/**
 * The example as a callable, with its imports resolved through `$import`.
 *
 * A page example is ES module source and cannot be `import()`ed from a string
 * without a loader, so its import statements are rewritten to destructuring
 * and the body is run as an async function — which is also what gives it the
 * top-level await every example uses. Only the named form is understood, and
 * anything else throws here rather than reaching the runtime as a
 * ReferenceError three lines later.
 */
function compile(source, where) {
  const heads = [];
  const body = source.replace(IMPORT, (line) => {
    const m = NAMED.exec(line);
    if (m === null) {
      throw new Error(`${where}: an example imports by name only, not: ${line.trim()}`);
    }
    heads.push(`const {${m[1]}} = $import(${JSON.stringify(m[2])});`);
    return "";
  });
  return new AsyncFunction("$import", `${heads.join("\n")}\n${body}`);
}

/** The paths a volume holds, minus the bookkeeping, relative to the cwd. */
function listing(vol) {
  const cwd = process.cwd();
  const files = new Map();
  for (const [path, content] of Object.entries(vol.toJSON())) {
    // memfs reports an empty directory as a null entry.
    if (content === null) continue;
    const rel = path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path;
    if (rel.split("/").includes(".jostraca")) continue;
    files.set(rel, content);
  }
  return files;
}

/**
 * Run one example and return what it wrote.
 *
 * The `Jostraca` the example imports is the real one with `mem: true` forced
 * on, wrapped so that the volume and the filesystem reach this side. The
 * example's own `node:fs` is a proxy onto that same filesystem, resolved at
 * call time because it does not exist until the first generate has run.
 */
async function run(source, where, seed) {
  const volumes = new Set();
  let live = null;

  const filesystem = () => {
    if (live === null) {
      throw new Error(
        `${where}: the example used node:fs before its first generate(), ` +
          "and the in-memory volume does not exist until then",
      );
    }
    return live;
  };

  // Every member resolves at the moment it is used, not at the moment it is
  // imported: `const { appendFileSync } = ...` runs at the top of the example
  // and the volume does not exist until the first generate has run.
  const fs = new Proxy(
    {},
    {
      get: (_target, prop) =>
        new Proxy(function () {}, {
          apply: (_t, _this, args) => Reflect.apply(filesystem()[prop], filesystem(), args),
          get: (_t, key) => filesystem()[prop][key],
        }),
    },
  );

  const Jostraca = (gopts) => {
    // `vol` seeds the in-memory filesystem, which is how an example can show
    // a template that ALREADY EXISTS rather than one the generator has to
    // write first. Without it the only way to put a file where a Fragment
    // could read it was a preliminary generate, and that step is scaffolding
    // the reader has to skip past to reach the point.
    const instance = jostraca.Jostraca({
      ...(gopts ?? {}),
      mem: true,
      ...(seed ? { vol: seed } : {}),
    });
    return {
      ...instance,
      generate: async (opts, root) => {
        const res = await instance.generate(opts, root);
        volumes.add(res.vol());
        live = res.fs();
        return res;
      },
    };
  };

  const MODULES = {
    jostraca: { ...jostraca, Jostraca },
    "node:fs": fs,
  };

  await compile(source, where)((spec) => {
    const mod = MODULES[spec];
    if (mod === undefined) {
      throw new Error(`${where}: an example may import "jostraca" and "node:fs", not "${spec}"`);
    }
    return mod;
  });

  if (volumes.size === 0) throw new Error(`${where}: the example never called generate()`);
  if (1 < volumes.size) {
    throw new Error(
      `${where}: the example generated into more than one volume, so a single ` +
        "listing cannot say which one it describes",
    );
  }
  const wrote = listing([...volumes][0]);
  // Seeded files are INPUT, not output. The listing a page states is captioned
  // "what it wrote", so a template the harness put there before the run
  // started does not belong in it. listing() has already made paths relative
  // to the cwd, which is what a page states, so strip the same prefix here.
  const cwd = `${process.cwd()}/`;
  for (const path of Object.keys(seed ?? {})) {
    wrote.delete(path.startsWith(cwd) ? path.slice(cwd.length) : path);
  }
  return wrote;
}

// ── the listing ───────────────────────────────────────────────────────────

/** A file's content as the lines a listing states for it. */
function contentLines(content) {
  if (content === undefined) return undefined;
  if (content === "") return [];
  return content.replace(/\n$/, "").split("\n");
}

function parseListing(text, where) {
  const files = new Map();
  let path = null;
  for (const line of text.replace(/\n+$/, "").split("\n")) {
    if (/^\S/.test(line)) {
      path = line.trim();
      files.set(path, []);
    } else if (path === null) {
      throw new Error(`${where}: the listing starts with an indented line, so it names no file`);
    } else {
      files.get(path).push(line.replace(/^ {2}/, ""));
    }
  }
  if (files.size === 0) throw new Error(`${where}: the listing is empty`);
  return files;
}

/** What the run wrote, in the format a page states, ready to paste. */
function render(files) {
  return [...files.keys()]
    .sort()
    .map((path) => [path, ...contentLines(files.get(path)).map((l) => `  ${l}`)].join("\n"))
    .join("\n");
}

// ── the pages ─────────────────────────────────────────────────────────────

const authored = pages(join(ROOT, "src", "pages"));

test("site-authored pages exist to check", () => {
  assert.ok(0 < authored.length, "no .astro pages found under src/pages");
});

let pairs = 0;
const unreadable = [];

for (const path of authored) {
  const rel = relative(ROOT, path);
  let found;
  try {
    found = examples(readFileSync(path, "utf8"), rel);
  } catch (err) {
    // Reported by a test of its own rather than thrown here, where it would
    // take the whole file down and say nothing about the other pages.
    unreadable.push(err.message);
    continue;
  }
  if (found.size === 0) continue;

  for (const [name, { example, result, input }] of found) {
    pairs++;
    test(`${rel} · ${name} · writes what the page says it writes`, async () => {
      const where = `${rel} · ${name}`;
      assert.ok(example, `${where}: RESULT states an output for an EXAMPLE that is not there`);
      assert.ok(result, `${where}: EXAMPLE states no RESULT`);

      // Volume keys are CWD-ABSOLUTE. A page states its input the way it
      // states its output, relative to the working directory, so the paths
      // are resolved here rather than spelled out on the page.
      const seed = input
        ? Object.fromEntries(
            [...parseListing(input, `${where} INPUT`)].map(([f, lines]) => [
              join(process.cwd(), f),
              lines.join("\n") + "\n",
            ]),
          )
        : undefined;

      const actual = await run(example, where, seed);
      const stated = parseListing(result, where);
      const wrote = `\n\nwhat the run actually wrote:\n\n${render(actual)}\n`;

      assert.deepEqual(
        [...actual.keys()].sort(),
        [...stated.keys()].sort(),
        `${where}: the page lists a different set of files than the generator wrote.${wrote}`,
      );

      for (const [file, lines] of stated) {
        assert.deepEqual(
          contentLines(actual.get(file)),
          lines,
          `${where}: ${file} does not hold what the page says it holds.${wrote}`,
        );
      }
    });
  }
}

test("the authored pages carry examples at all", () => {
  // Zero pairs is a passing suite that checks nothing, which is the one
  // outcome this file must never report quietly.
  assert.ok(0 < pairs, "no EXAMPLE/RESULT pair found on any authored page");
  assert.deepEqual(unreadable, [], unreadable.join("\n"));
});

// ── drift guards ──────────────────────────────────────────────────────────
//
// The sync guards everything it carries. Nothing guards a claim someone typed
// into a page here, and these are the two claims most likely to go stale.

/**
 * The components the pinned package exports, named by the package itself.
 *
 * The package exports its components and its plain helpers side by side and
 * marks neither, so the set cannot be read off the exports alone: `cmp()`
 * copies the wrapped function's name onto the wrapper it returns, which
 * leaves a component looking exactly like `each` or `template`. Behaviour is
 * what tells them apart. A component called outside `generate()` throws and
 * names itself in the message, so that is what this asks for: every exported
 * function is called, and the ones that answer with that error are the
 * components.
 */
function exportedComponents() {
  const found = [];
  for (const [key, value] of Object.entries(jostraca)) {
    if ("function" !== typeof value) continue;
    try {
      value();
    } catch (err) {
      const m = /^jostraca: component (\S+) called outside generate\(\)/.exec(
        String(err && err.message),
      );
      if (m === null) continue;
      assert.equal(m[1], key, `the package exports the ${m[1]} component as ${key}`);
      found.push(key);
    }
  }
  return found;
}

test("the component list is exactly the pinned package's, no more and no less", () => {
  // A component added, renamed or withdrawn upstream changes the landing page,
  // the reference and this list. Reading it from the package is the only way
  // the site finds that out on the release it happens in rather than on the
  // next day someone thinks to look.
  const consts = readFileSync(join(ROOT, "src/consts.ts"), "utf8");
  const block = /export const COMPONENTS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(consts);
  assert.ok(block, "src/consts.ts no longer declares a COMPONENTS array this test can read");

  const fromPage = [...block[1].matchAll(/\bname:\s*"([A-Za-z]+)"/g)].map((m) => m[1]);
  const fromPackage = exportedComponents();

  assert.ok(0 < fromPackage.length, "no components could be read from the jostraca package");
  assert.deepEqual(
    [...fromPage].sort(),
    [...fromPackage].sort(),
    "COMPONENTS in src/consts.ts and the pinned package's components disagree",
  );
});

test("no page writes the mode count out in prose", () => {
  // Same rule as below, for the same reason, over the other list consts.ts
  // owns. MODES is not held to the package the way COMPONENTS is -- the
  // existing-file modes are option flags, not exports -- so a typed count
  // here would go stale silently and in two places at once.
  for (const path of authored) {
    assert.doesNotMatch(
      readFileSync(path, "utf8"),
      /\b(?:\d+|three|four|five|six|seven)\s+modes\b/i,
      `${relative(ROOT, path)} states a mode count in prose; render MODES.length`,
    );
  }
});

test("no page writes the component count out in prose", () => {
  // The list is held to the package by the test above, so it changes when the
  // package does. A number typed into a sentence does not, and nothing else
  // here would notice. Render COMPONENTS.length instead.
  for (const path of authored) {
    assert.doesNotMatch(
      readFileSync(path, "utf8"),
      /\b(?:\d+|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)\s+components\b/i,
      `${relative(ROOT, path)} states a component count in prose; render COMPONENTS.length`,
    );
  }
});
