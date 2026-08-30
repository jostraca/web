import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { SITE_URL, JOSTRACA_VERSION, GITHUB_REPO, GO_MODULE } from "../consts";

// What this site runs, and what it documents — two different facts whenever
// the synced documentation is ahead of the published package. Both are stated
// rather than reconciled into one number, because reconciling them would be a
// guess.
export const GET: APIRoute = async ({ site }) => {
  const origin = site?.origin ?? SITE_URL;
  const docs = await getCollection("docs");
  const howto = await getCollection("howto");

  const body = {
    $comment:
      "The generator version this site runs its examples against, and the size of the surfaces it serves.",
    generator: {
      npm: "jostraca",
      version: JOSTRACA_VERSION,
      go_module: GO_MODULE,
      source: GITHUB_REPO,
    },
    surfaces: {
      docs: { count: docs.length, url: `${origin}/docs` },
      howto: { count: howto.length, url: `${origin}/how-to` },
      llms: [`${origin}/llms.txt`, `${origin}/llms-full.txt`],
    },
    markdown:
      "Every page also answers `Accept: text/markdown` at its own URL, or append `.md` to the path.",
  };

  return new Response(JSON.stringify(body, null, 2) + "\n", {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
