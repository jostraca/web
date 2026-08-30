import type { APIRoute } from "astro";
import { SITE_URL } from "../consts";

// Everything here is public documentation and is meant to be read — by
// crawlers, by agents, by anything. The one thing worth saying is where the
// machine-readable index lives, since a crawler that finds llms.txt does not
// have to render a page of HTML to learn what the site holds.
export const GET: APIRoute = ({ site }) => {
  const origin = site?.origin ?? SITE_URL;
  const body = [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${origin}/sitemap-index.xml`,
    "",
    "# The same content, written for machines:",
    `#   ${origin}/llms.txt`,
    "# Any page also answers `Accept: text/markdown` at its own URL.",
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
