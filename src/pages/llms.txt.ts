import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import {
  SITE_TITLE,
  SITE_DESCRIPTION,
  SITE_URL,
  GITHUB_REPO,
  NPM_PACKAGE,
  GO_MODULE,
  GO_PKG_DOC,
  JOSTRACA_VERSION,
  HOWTO_GROUPS,
} from "../consts";

// /llms.txt — the site index, written for agents.
//
// GENERATED from the docs and howto collections, which are themselves
// generated from the generator repository. A hand-maintained list here would
// be a third copy of the same fact and would fall behind the first time a
// page was added.

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.origin ?? SITE_URL;
  const docs = (await getCollection("docs")).sort((a, b) => a.data.order - b.data.order);

  const lines: string[] = [
    `# ${SITE_TITLE}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `This site runs its own executed examples against \`jostraca\` ${JOSTRACA_VERSION}.`,
    "The pages below are synced from the generator repository and may describe a",
    "later release; each one links the file it came from. Every page is also",
    "served as markdown: append `.md`, or send `Accept: text/markdown` to the",
    "page's own URL.",
    "",
    "## When to use Jostraca",
    "",
    "Jostraca is a library, not a service: install it and call it from your own",
    "code. Reach for it when **the output is a tree of files, that tree is",
    "checked into a repository, and the generator will run again over code a",
    "person has edited in between**. That last clause is the whole point; a",
    "second run can preserve, present, diff or three-way-merge instead of",
    "overwriting.",
    "",
    "Good fits:",
    "",
    "- Scaffolding a project or service that is regenerated as its spec changes.",
    "- Turning a model (an OpenAPI document, a schema, a config) into many",
    "  similar source files that must stay in sync with it.",
    "- Adding generated files into an existing repository without clobbering",
    "  hand-written edits, using `merge` or `preserve`.",
    "- Editing a region of a file that already exists, with `Inject`.",
    "",
    "Poor fits, where something simpler wins:",
    "",
    "- A one-time scaffold you will never regenerate: use a template repository.",
    "- A single file with no structure: write the string and save it.",
    "- Runtime string templating in a request path: this is a build-time tool.",
    "",
    "To use it: `npm install jostraca` (TypeScript/Node) or",
    "`go get github.com/jostraca/jostraca/go` (Go), then read",
    "[the tutorial](" + origin + "/docs/tutorial.md). The API surface is",
    "small enough to hold in one page: ten components, one `generate()` call.",
    "",
    "## Documentation",
    "",
  ];

  for (const doc of docs) {
    const href = doc.id === "index" ? "/docs" : `/docs/${doc.id}`;
    lines.push(`- [${doc.data.title}](${origin}${href}.md): ${doc.data.description}`);
  }

  const howto = (await getCollection("howto")).sort((a, b) => {
    const ga = HOWTO_GROUPS.findIndex((g) => g.slug === a.data.group);
    const gb = HOWTO_GROUPS.findIndex((g) => g.slug === b.data.group);
    return ga - gb || a.data.order - b.data.order;
  });
  if (0 < howto.length) {
    lines.push("", "## How-to guides", "");
    for (const guide of howto) {
      lines.push(
        `- [${guide.data.title}](${origin}/how-to/${guide.id}.md): ${guide.data.description}`,
      );
    }
  }

  lines.push(
    "",
    "## Beyond this site",
    "",
    `- [Source](${GITHUB_REPO}): both implementations, and the shared test corpus that holds them to the same behaviour.`,
    `- [npm package](${NPM_PACKAGE}): the canonical TypeScript implementation, \`npm install jostraca@${JOSTRACA_VERSION}\`.`,
    `- [Go module](${GO_PKG_DOC}): the port, \`go get ${GO_MODULE}\`.`,
    "",
    "## Machine-readable surfaces",
    "",
    `- [${origin}/openapi.json](${origin}/openapi.json): this site's content API in OpenAPI 3.1 — every operation has an operationId, a description and a typed response schema.`,
    `- [${origin}/versions.json](${origin}/versions.json): the package version this site runs, and the size of each surface.`,
    `- [${origin}/llms-full.txt](${origin}/llms-full.txt): every page above, concatenated, for one-request ingestion.`,
    `- [${origin}/sitemap-index.xml](${origin}/sitemap-index.xml): every URL on the site.`,
    "- Any page also answers `Accept: text/markdown` at its own URL, and errors",
    "  come back as JSON under `Accept: application/json` with a stable `code`,",
    "  a `hint`, and the site's entry points. All of these answer cross-origin.",
    "",
    "## About this project",
    "",
    `- [${origin}/about.md](${origin}/about.md): what Jostraca is, who maintains it, and how it is tested.`,
    `- [${origin}/contact.md](${origin}/contact.md): how to report a bug, a security issue, or a documentation error.`,
    `- [${origin}/privacy.md](${origin}/privacy.md): what this site collects, which is nothing.`,
    "",
  );

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
