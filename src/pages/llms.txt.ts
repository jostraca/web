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
  );

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
