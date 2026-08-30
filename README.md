# jostraca/web

Source of **[jostraca.org](https://jostraca.org)** — the project site and
documentation for [Jostraca](https://github.com/jostraca/jostraca), a code and
project generator. An [Astro](https://astro.build) site deployed to Cloudflare
Workers.

This repository ships no library: nothing here is published to npm or
importable as a Go module. It *consumes* the published `jostraca` package, so
the examples on site-authored pages run the real generator rather than a mock.

## Quick start

```bash
npm install
npm run dev          # local dev server
npm run sync-docs    # regenerate the synced content from ../jostraca
npm run build        # astro build + markdown twins, into dist/
npm run check        # the gate: sync, build, tsc, tests, dry-run deploy
```

**`npm run check` is the gate, and you have to run it yourself.** Cloudflare
builds the site on merge, but a build is not a test run: nothing on the server
executes the examples or the Worker suite. A green deploy is not evidence the
site is right; `npm run check` is.

## The site renders the docs; it does not author them

Everything under `src/content/docs/` and `src/content/howto/` is **generated**
from [`jostraca/jostraca`](https://github.com/jostraca/jostraca)'s `docs/*.md`
and `docs/how-to/*.md` by `tools/sync-docs.mjs`, and committed here. Do not
edit those files.

A correction belongs upstream, where every snippet in them is executed on each
`make test`. `ts/test/docs.test.ts` writes each example into a temp directory,
runs it there, and compares the file tree it wrote against the tree the page
claims, plus each named file against the content the page shows. A second copy
typed out on a website inherits none of that and drifts from it silently,
which is why this site does not keep one.

Generated *and* committed, so a Cloudflare build stays a plain
`npm ci && npm run build` against a clone of this repository alone, and
staleness is caught by a gate rather than by a reader:

```bash
npm run sync-docs    # rewrite from a sibling ../jostraca checkout
npm run check-sync   # fail if what is committed is stale
```

`check-sync` says nothing when the sibling is absent, so it is inert in a CI
job that clones only this repository. It is a contributor-side gate.

The sync also **checks every link**. A relative link in an upstream document
is resolved against the repository root and must exist on disk; a link that
escapes the root, or points at nothing, fails the sync rather than shipping.
Surviving links become site routes where this site renders the target, and
absolute repository URLs otherwise.

Pages with no upstream counterpart *are* authored here, in `src/pages/`: the
landing page, `/why`, the grouped `/how-to` index and `/404`.

## Examples on authored pages are executed

`test/examples.test.mjs` pulls every `EXAMPLE` / `RESULT` pair out of the
`.astro` pages in `src/pages/` and runs it through the pinned generator. A
page that states an output states the generator's, or the test fails. The same
test holds `COMPONENTS` in `src/consts.ts` to the components the package
exports, so a component added or renamed upstream fails here rather than
leaving the landing page a version behind.

Synced pages are deliberately **not** re-checked here. Upstream already holds
them, on the same content, and a second gate on one fact is the thing the sync
exists to avoid.

## Keep the pin current

The site must run against the **currently published** `jostraca`, pinned
exactly: `"0.33.1"`, not `"^0.33.1"`. Pre-1.0, a caret range silently refuses
the next minor and the site quietly falls behind the package it documents. Bump
the pin and re-run `npm run check` in the same commit.

`JOSTRACA_VERSION` in `src/consts.ts` re-exports the version from the
installed package rather than restating it, so the footer, `/versions.json`
and the executed examples all read one fact. When the synced documentation is
ahead of the published package, `/versions.json` reports the pin as its own
fact rather than as the version those pages describe.

## Deployment is automatic

**Merging to `main` is the deploy step.** Cloudflare builds and publishes from
`main` through its own Git integration, so there is nothing to run and no
workflow file to look for. The absence of `.github/workflows/` here does *not*
mean deployment is manual.

Do not run `npm run deploy` (`wrangler deploy`) **by hand** as part of
shipping a change. It is the Builds pipeline's own deploy command, so it is
what runs on every merge, from Cloudflare's builder against a clean checkout.
Running it locally publishes whatever `dist/` you happen to have, which is how
a stale build reaches production. It stays for manual recovery, and an agent
session usually has no Cloudflare credentials (`wrangler whoami` reporting
"not authenticated" is expected, not broken).

The Worker is **`jostraca-web`**, and `wrangler.json` carries its triggers:
`jostraca.org` and `www.jostraca.org` as custom domains. Keep them there. They
are attached by the deploy rather than by clicking, and they belong in the file
rather than the dashboard: the tabnas site's routes lived only in its dashboard
for months, which meant nothing in that repository recorded what actually
served it.

**There is no `workers.dev` URL for this Worker.** That route is off for
Workers on this account, so a 404 there is not evidence a Worker is broken. The
custom domain is the only way in, which also makes it the only place a deploy
can be verified.

`jostraca.org` is declared in `SITE_HOST` in `src/consts.ts` and in
`wrangler.json`'s routes. Six files name it in all, because four of them
cannot import the constant; grep for the string rather than trusting the
constant to cover them.

## Layout

| Path | What it is |
|---|---|
| `src/pages/` | Routes. `.astro` maps to a URL; these are authored here. |
| `src/content/docs/` | **Generated.** The seven synced documentation pages. |
| `src/content/howto/` | **Generated.** The synced task guides, one file per guide. |
| `src/content.config.ts` | The two collections' schemas, including the how-to group taxonomy. |
| `src/layouts/` | The page shell, and the docs and how-to layouts with their sidebars. |
| `src/components/` | Header, footer, `<head>`, analytics. |
| `src/worker.ts` | The request Worker — negotiation, JSON errors, the canonical-host redirect. |
| `src/consts.ts` | Site constants: the nav, the pin, the how-to groups, the component and mode lists. |
| `src/styles/tokens.css` | The design tokens. Launch neutrals; the seam for a real identity. |
| `tools/sync-docs.mjs` | The sync, and its link checker. |
| `tools/gen-markdown.mjs` | Converts built HTML into the markdown twins. |
| `test/` | Worker negotiation, and the executed examples. |

## The Worker

`wrangler.json`'s `main` is `src/worker.ts`, not the Cloudflare adapter's
generated `dist/_worker.js`. It exists for things a static asset server cannot
express, all for machine callers: `Accept: text/markdown` negotiation with
`Vary: Accept`; structured JSON errors on the machine surface; a recoverable
404 that answers browsers, bare clients and programs differently; and the
redirect that makes the apex host canonical to anything that keys on the host,
rather than only to a search engine reading `<link rel="canonical">`.

Astro middleware cannot do any of it. The Cloudflare adapter short-circuits a
prerendered route straight to `ASSETS` before middleware runs, and with
`output: "static"` every route is prerendered.

## Contributing

Prose here follows the generator repository's
[`docs/STYLE-GUIDE.md`](https://github.com/jostraca/jostraca/blob/master/docs/STYLE-GUIDE.md),
which names this site in its own scope. [AGENTS.md](AGENTS.md) is the working
guide: what is generated and what is authored, the sync, the gate, the Worker,
theming and deployment.

Open pull requests ready for review, never as drafts.

## Licence

MIT, as with the rest of the project.
