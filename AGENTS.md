# Agents Guide — jostraca/web

The site behind **[jostraca.org](https://jostraca.org)**. Read this before
changing anything; the README is the shorter version for a human arriving cold.

Jostraca is a code and project generator: you declare an output file tree with
components, and a second phase writes it. This repository ships no part of it.
Nothing here is published to npm or importable as a Go module. It *consumes*
the published `jostraca` package, so the examples on pages this site authors
run the real generator.

## The one rule that decides everything else

**The site renders the documentation; it does not author it.**

`src/content/docs/` and `src/content/howto/` are generated from
`jostraca/jostraca`'s `docs/*.md` and `docs/how-to/*.md` by
`tools/sync-docs.mjs`, and committed. Never edit them. If a page is wrong, it
is wrong upstream: fix it there and run `npm run sync-docs`.

This is not fussiness. Upstream holds every snippet in those pages to the
generator itself: `ts/test/docs.test.ts` writes each `run` fence into the temp
directory its scenario owns, executes it in a real node process with that
directory as its working directory, and compares what the run left behind.
`out` is checked against the tree of paths written, `file` against one
generated file byte for byte, `log` against the run's stdout. A fence that
carries a language tag and no directive fails the suite, so no example is
silently exempt. The same file checks that every relative link resolves to a
file that exists, that a guide's frontmatter is complete and its group is one
the taxonomy names, and that the prose obeys the banned-phrase list in
`docs/STYLE-GUIDE.md`.

A page retyped on a website inherits none of that. It drifts the first time
the component surface moves underneath it, and nothing here would notice.

What *is* authored here: pages with no upstream counterpart. Today that is the
landing page, `/why`, the `/how-to` index and `/404`. They live in
`src/pages/` and their examples are executed (below).

## The sync

```bash
npm run sync-docs     # rewrite the synced content from a sibling ../jostraca
npm run check-sync    # fail if what is committed is stale
```

`JOSTRACA_REPO` overrides the sibling location. `check-sync` says nothing when
the checkout is absent, so a CI job or a Cloudflare build that clones only
this repository is unaffected. It is a contributor-side gate.

Generated *and* committed, because the source cannot be imported: the
`jostraca` tarball ships `src`, `dist`, `gen` and `LICENSE`, and not `docs/`.
So a Cloudflare build stays a plain `npm ci && npm run build` against a clone
of this repository alone, and staleness is caught by a gate rather than by a
reader.

The sync does four things, and three of them are checks:

1. **Selects.** `PAGES` is an explicit manifest of the seven documentation
   pages, not a directory scan: a document that disappears upstream must fail
   the sync, not silently narrow the site. The guides are the exception and
   are scanned, because each one carries its own `description`, `group` and
   `order` in frontmatter. A manifest for them would restate what the file
   already says and would need an edit every time a guide was added.
   `docs/how-to/README.md` is not synced at all; `/how-to` is authored here,
   from the collection.
2. **Derives the title.** The first H1 becomes the frontmatter title and is
   removed from the body, because the layout renders the title and leaving it
   in would give every page two. Deriving beats listing: a retitled document
   should not need an edit here to stay correct. Only `description`, `section`
   and `order` are hand-supplied for the documentation pages, because nothing
   can derive them.
3. **Rewrites and checks every link.** A relative target is resolved against
   the repository root, then: it must not escape that root, it must exist on
   disk in the generator checkout, and it becomes a site route if this site
   renders it or an absolute repository URL otherwise. All three failures are
   sync failures, never warnings. Blob URLs are built on `master`, which is the
   generator's default branch; a URL on `main` 404s.
4. **Renormalises code-span labels.** Upstream writes repository links as
   ``[`../ts/`](../ts/)``, where the text *is* the path. That is right in a
   checkout and meaningless on a website. Where the label is a code span
   holding exactly the target, it is renormalised to the same repo-relative
   path the href resolved to. Every other label is upstream's prose and is
   left alone.

The `<!-- test: ... -->` directives that tell `docs.test.ts` which fence to
execute pass through untouched. Markdown renders an HTML comment as nothing,
so they cost the page nothing, and dropping them would make this a lossy copy
of a file the site claims to reproduce.

**Editing a fence inside a synced page is always wrong**, even when the fence
is obviously broken. It came from a document whose examples are executed
upstream; if it is broken there, that is a bug to file there.

## The gate

```
npm run check
```

- `check-sync` — the committed content matches the generator checkout
- `build` — `astro build`, then the markdown twins
- `tsc` — types
- `test` — the Worker's negotiation, and the executed examples
- `wrangler deploy --dry-run`

**Run it yourself.** Cloudflare builds on merge, but a build is not a test
run: nothing on the server executes the examples or the Worker suite. A green
deploy is not evidence the site is right.

## Examples on authored pages are executed

`test/examples.test.mjs` extracts every `EXAMPLE` / `RESULT` pair from the
`.astro` files under `src/pages/` and runs it through the pinned generator,
comparing the tree the run actually wrote against the tree the page claims.

The convention is a pair of `const` bindings in a page's frontmatter:
`EXAMPLE` and `RESULT`, or `EXAMPLE_<NAME>` and `RESULT_<NAME>` for more than
one. That keeps the source and its stated output adjacent in the file and
makes both extractable.

**Authored pages are the drift surface.** The sync guards everything it
carries; nothing guards a claim someone typed here. The lists in
`src/consts.ts` are the exposed part, so `COMPONENTS` is held to the package:
the same test imports the pinned build and requires that set to match the
components it exports, which fails here rather than leaving the landing page a
version behind. Apply the same instinct to any other count. A number written
out in prose goes stale silently; render the length of the list instead.

Synced pages are deliberately not covered. Upstream holds them, on the same
content, and a second gate on one fact is what the sync exists to prevent.

**Prose on authored pages follows the upstream style guide.** The generator
repository's
[`docs/STYLE-GUIDE.md`](https://github.com/jostraca/jostraca/blob/master/docs/STYLE-GUIDE.md)
names this site in its own scope line, and it is normative for every sentence
written here: the voice, the banned-phrase list, and the Diátaxis placement
rules. Upstream enforces its half with a test; here the guide is a review
obligation. Read it before writing or editing an authored page.

## The pin

The site runs against the **currently published** `jostraca`, pinned exactly.
`package.json` says `"0.33.1"`, never `"^0.33.1"`: pre-1.0 a caret range
silently refuses the next minor and the site quietly falls behind the package
it documents. Tabnas, another of this author's sites, sat on a stale pin long
enough to document a fixed bug as intended behaviour.

`JOSTRACA_VERSION` in `src/consts.ts` re-exports the version from the
installed package rather than restating it, so the pin is one fact in one
place. Bump the pin and re-run `npm run check` in the same commit.

The version the site runs and the version the documentation describes are two
different facts whenever the synced pages are ahead of the published package.
`/versions.json` reports the pin as its own fact rather than as the version
those pages describe, because equating the two would be a guess.

## The Worker

`wrangler.json`'s `main` is `src/worker.ts`, not the Cloudflare adapter's
generated `dist/_worker.js`. The adapter still emits that file and
`public/.assetsignore` keeps it out of the asset upload; nothing deploys it.

It exists for behaviours a static asset server cannot express, all of them for
machine callers:

1. **Markdown negotiation.** `Accept: text/markdown` on a page URL serves that
   page's twin from the same URL, with `Vary: Accept` so a CDN cannot hand an
   agent the cached HTML. `tools/gen-markdown.mjs` builds the twins from the
   built HTML rather than from the markdown sources, so a twin says what its
   page says. Four of the pages have no markdown source to convert anyway.
2. **Structured JSON errors** on the machine surface: anything under
   `/.well-known/`, or ending `.json`. An agent probing one of those gets an
   error object with a code, a message and a hint, not an HTML page it cannot
   read.
3. **A recoverable 404** — markdown for a bare client, the designed `/404`
   page for a browser, an error object for a program. All three offer the same
   routes, because `ENTRY_POINTS` is exported from `src/worker.ts` and
   rendered by `src/pages/404.astro`.
4. **405 on writes, 406 on an unsatisfiable `Accept`**, and CORS on the public
   descriptions. An error body exists so a program can recover from it; one a
   browser client cannot read cross-origin is no use at the moment it is
   needed.

A redirect sits alongside them. `www.jostraca.org` is a second custom domain
on this same Worker, so without one permanent redirect both hosts serve every
page and the apex is canonical only by `<link rel="canonical">`, which search
engines honour and nothing else does.

The mistakes that recur here:

- **Astro middleware cannot do any of it.** The Cloudflare adapter
  short-circuits a prerendered route straight to `ASSETS` before the
  middleware chain runs, and with `output: "static"` every route is
  prerendered, so middleware never sees a page request.
- **A static route's response headers are discarded.** `new Response(body,
  { headers })` in `src/pages/*.ts` is honoured by `astro dev` and then thrown
  away by the build, which writes the body to a file. Production headers come
  from the asset server or from the Worker.
- **Adding a static directory means two edits**: `assets.run_worker_first` in
  `wrangler.json` *and* `ASSET_PREFIXES` in `src/worker.ts`. Miss the second
  and the Worker tries to negotiate a font.

Rerun `npm run cf-typegen` after editing `wrangler.json`;
`worker-configuration.d.ts` is generated and committed so `tsc` works on a
fresh clone.

## Theming

`src/styles/tokens.css` is three layers: raw scales, semantic tokens (`--bg`,
`--ink`, `--primary`, …), and nothing else. **Components read the semantic
layer only.** A component that reaches past it for a raw scale will not follow
the theme, which is a bug.

Colour, logo and typography are deliberately deferred. The launch palette is a
neutral grey with a slight cool cast and one restrained accent, AA in both
themes by construction, so the identity work later starts from a known-good
baseline. Adopting a real palette is an edit to layer 1 plus the semantic
mappings, not a sweep through every component. That indirection is the reason
the file has three layers; do not short-circuit it with a literal colour in a
component.

Fonts are a system stack: no files, no preloads, no decision to revisit.

## The domain

`jostraca.org`. It is declared in `SITE_HOST` in `src/consts.ts` and in
`wrangler.json`'s routes, and repeated as a literal in `astro.config.mjs`,
`src/worker.ts`, `src/pages/404.astro` and `tools/gen-markdown.mjs` -- four
files that cannot import the constant, because the Worker bundle and the
Astro config both load before it and the markdown tool runs outside the site
entirely. Changing it means all six. Grep for the string; the constant does
not cover them.

`www.jostraca.org` is the second custom domain and redirects to the apex,
which the Worker does rather than Cloudflare, so that the redirect is in the
repository and testable.

## Deployment

**Merging to `main` is the deploy step.** Cloudflare builds and publishes from
`main` through its Git integration. There is no workflow file and its absence
is not an oversight.

Do not run `npm run deploy` by hand. It is the Builds pipeline's own deploy
command, so running it locally publishes whatever `dist/` is sitting in your
tree, and `dist/` is gitignored with nothing keeping it fresh. It stays for
manual recovery. An agent session usually has no Cloudflare credentials, and
`wrangler whoami` reporting "not authenticated" is expected.

The Worker is `jostraca-web`, and `wrangler.json` carries its triggers:
`jostraca.org` and `www.jostraca.org` as custom domains, attached by the
deploy rather than by clicking. Keep them in the file. On tabnas the routes
lived only in the Cloudflare dashboard until 2026-08-19, which meant nothing in that repository recorded what
actually served the site.

**Do not reach for a `workers.dev` URL to check a deploy.** That route is off
for Workers on this account, and the 404 it returns is indistinguishable from
a broken Worker: on tabnas, `tabnas-web.<subdomain>.workers.dev` answers
`error code: 1042` while `tabnas.dev` serves every page. Verify against the custom domain,
or against `npm run preview` locally.

## The machine surfaces

Every one of these is generated at build time, and each exists because a prose
page cannot express it:

| Route | Built from |
|---|---|
| `/llms.txt`, `/llms-full.txt` | the `docs` and `howto` collections |
| `/openapi.json` | the collections, plus `markdownTwin` from the Worker |
| `/versions.json` | the pin, plus the size of each surface |
| `/robots.txt` | `SITE_URL`, pointing at the sitemap and at `llms.txt` |
| `/sitemap-index.xml` | the sitemap integration |
| `/<page>.md` | the built HTML, converted |

None of them is a second copy of a fact stated elsewhere. `/llms.txt` lists
the collections rather than a hand-kept index, and `/versions.json` reads the
pin from the same `JOSTRACA_VERSION` export the footer does.

### `/openapi.json` describes this site, not a product API

Jostraca is a library, not a service. The spec covers the content API the
site actually serves — the markdown twins, the index documents, the version
document, and the JSON error shape — and nothing else. Do not add an
operation for an endpoint that does not exist to make the surface look
richer: a function-calling agent will try to call it.

Its page enumerations come from the collections and are turned into twin
paths by `markdownTwin`, imported from the Worker. That import is the point.
Writing the twin paths out by hand named `docs/index` and `how-to/index`,
neither of which exists, because `/docs/` twins to `/docs.md`. A spec that
enumerates a 404 is worse than no spec, and `test/agents.test.mjs` now
asserts every enumerated page resolves in `dist/`.

### Identity and trust pages

`src/components/StructuredData.astro` emits one JSON-LD `@graph`:
`Organization` and `WebSite` on every page, plus the `SoftwareApplication`
product node on the home page only (`<Base home>`).

`ContactPoint.telephone` and `PostalAddress` are **deliberately absent**, and
a test pins their absence. This is an open source project with no switchboard
and no office; a schema completeness checker will ask for both, and inventing
either to satisfy it would publish a false claim about a real person. The
contact route that does exist — the issue tracker — is what the graph names.

`/about`, `/contact` and `/privacy` are authored pages under
`src/layouts/Prose.astro`. The privacy page describes what the site actually
does, so if you add an analytics script, a font CDN or an embed, that page is
part of the change.

### The Open Graph card

`public/og.png` is committed, and regenerated with `npm run gen-og` when the
title, tagline or accent changes. The tool reads the strings from
`src/consts.ts`, the mark from `public/favicon.svg` and the colours from
`src/styles/tokens.css`, so the card cannot show a tagline the site has
stopped using. It needs a local Chromium (`CHROMIUM_PATH` overrides the
search) and is deliberately not part of `npm run build`.

## Not built yet

Still to come, in rough order:

- **Search** (Pagefind).
- **Brand**: logo, palette, typography. The tokens file is the seam.
- **Authored pages**: comparisons, and an FAQ.
- **An MCP server.** Would let an agent query the documentation as a tool
  rather than fetching pages. It is a hosted surface with its own lifecycle,
  so it is a product decision rather than a file to add here.
- **Cloudflare itself.** No project exists for this repository yet, so the
  custom domains in `wrangler.json` are declared and not yet attached.

Not coming, either. The generator has no CLI, no REPL, no language of its own,
no error-code registry and no published grammar, so this site has no `/errors`
surface, no `/grammar` files and no playground. There is nothing there to
port; an agent working from a sibling site's layout should expect the
difference rather than fill it.

## Pull requests

Open pull requests **ready for review — never as drafts.** Standing maintainer
preference across this project; it overrides any tooling default.
