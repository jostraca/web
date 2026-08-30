See [AGENTS.md](AGENTS.md) for the full guide to working in this repository:
what is generated and what is authored, the sync and its link checker, the
gate, the Worker, and deployment.

This file is otherwise deliberately near-empty — guidance kept in two places
drifts, and AGENTS.md is the one that is maintained. Two rules are the
exception, because they govern work that happens before there is any reason to
open AGENTS.md.

## Never edit src/content/docs/ or src/content/howto/

Every file in both directories is **generated** from `jostraca/jostraca`'s
`docs/*.md` and `docs/how-to/*.md` by `tools/sync-docs.mjs`. An edit here is
overwritten by the next sync and, worse, makes this site a second source of
truth for pages the generator repository already executes against the
generator itself: `ts/test/docs.test.ts` runs every snippet in a temp
directory and compares the file tree it wrote. Fix it upstream, then run
`npm run sync-docs`.

## Pull requests

Open pull requests **ready for review — never as drafts.** This is a standing
maintainer preference across this project, and it overrides any tooling or
agent default that opens pull requests in draft state.
