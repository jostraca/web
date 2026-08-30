import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import {
  SITE_TITLE,
  SITE_DESCRIPTION,
  SITE_URL,
  JOSTRACA_VERSION,
  GITHUB_REPO,
  HOWTO_GROUPS,
} from "../consts";

// /llms-full.txt — every documentation page, as one file.
//
// The companion to /llms.txt, which is an index. This is the corpus: a caller
// that would rather hold the documentation than fetch it a page at a time gets
// it in one request, in the order the sidebar puts it.
//
// Generated from the docs and howto collections — which are themselves
// generated from the generator repository — so it cannot fall behind the pages
// it concatenates. The frontmatter is stripped: it is this site's routing
// metadata, not content, and a reader of the corpus has no use for `order: 40`.

// The generator's default branch is `master`. A blob URL on `main` 404s, the
// same reason tools/sync-docs.mjs states.
const BLOB = `${GITHUB_REPO}/blob/master/`;

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.origin ?? SITE_URL;
  const docs = (await getCollection("docs")).sort((a, b) => a.data.order - b.data.order);

  const parts: string[] = [
    `# ${SITE_TITLE}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `Every documentation page, concatenated. Documented against \`jostraca\` ${JOSTRACA_VERSION}.`,
    `Source: ${GITHUB_REPO}. Index: ${origin}/llms.txt`,
    "",
    "Each page below is synced from the generator repository, where every tagged",
    "snippet is either executed by the test suite or carries a stated reason it",
    "is not.",
    "",
    "---",
    "",
  ];

  // The body without the generated frontmatter and the do-not-edit banner.
  const strip = (body: string | undefined) =>
    body
      ?.replace(/^---\n[\s\S]*?\n---\n/, "")
      .replace(/^<!--[\s\S]*?-->\n/, "")
      .trim() ?? "";

  for (const doc of docs) {
    const href = doc.id === "index" ? "/docs" : `/docs/${doc.id}`;
    parts.push(
      `# ${doc.data.title}`,
      "",
      `_${doc.data.description}_`,
      "",
      `Source: ${BLOB}${doc.data.source} · Page: ${origin}${href}`,
      "",
      strip(doc.body),
      "",
      "---",
      "",
    );
  }

  const howto = (await getCollection("howto")).sort((a, b) => {
    const ga = HOWTO_GROUPS.findIndex((g) => g.slug === a.data.group);
    const gb = HOWTO_GROUPS.findIndex((g) => g.slug === b.data.group);
    return ga - gb || a.data.order - b.data.order;
  });
  for (const guide of howto) {
    parts.push(
      `# ${guide.data.title}`,
      "",
      `_${guide.data.description}_`,
      "",
      `Source: ${BLOB}${guide.data.source} · Page: ${origin}/how-to/${guide.id}`,
      "",
      strip(guide.body),
      "",
      "---",
      "",
    );
  }

  return new Response(parts.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
