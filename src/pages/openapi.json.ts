import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { markdownTwin } from "../worker";
import {
  SITE_TITLE,
  SITE_URL,
  GITHUB_REPO,
  SITE_REPO,
  GO_MODULE,
  CONTENT_API_VERSION,
} from "../consts";

// /openapi.json — the machine surface of this site, described in OpenAPI 3.1.
//
// This site has no product API: Jostraca is a library you import, not a
// service you call. What it does have is a content API that agents already
// use — markdown twins, an index, a version document, and a structured error
// shape — and until now the only way to discover it was to read prose that
// said so. That is what this document describes, and nothing more. Inventing
// endpoints to look more API-shaped would make the spec a lie that a
// function-calling agent would then try to call.
//
// GENERATED, so the page enumerations come from the same collections that
// produce the pages. A hand-written spec would drift the first time a guide
// was added, and a spec that lists a 404 is worse than no spec.

/**
 * Every page route this site serves, in reading order.
 *
 * The twin enumeration below is derived from these by `markdownTwin`, the
 * same function the Worker answers requests with and BaseHead advertises
 * from. Spelling the twin paths out here instead would be a third copy of a
 * convention that has already caught me once: `/docs/` twins to `/docs.md`,
 * not `/docs/index.md`, so a hand-written list quietly named two files that
 * do not exist. A spec that enumerates a 404 is worse than no spec.
 */
async function pageRoutes(): Promise<string[]> {
  const docs = (await getCollection("docs")).sort((a, b) => a.data.order - b.data.order);
  const howto = (await getCollection("howto")).sort((a, b) => a.id.localeCompare(b.id));
  return [
    "/",
    "/why",
    "/about",
    "/contact",
    "/privacy",
    "/docs",
    ...docs.filter((d) => d.id !== "index").map((d) => `/docs/${d.id}`),
    "/how-to",
    ...howto.map((g) => `/how-to/${g.id}`),
  ];
}

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.origin ?? SITE_URL;
  const routes = await pageRoutes();

  // `/docs/tutorial` -> `docs/tutorial`, `/` -> `index`. Derived, never typed.
  const twins = routes
    .map((r) => markdownTwin(r))
    .filter((t): t is string => t !== null)
    .map((t) => t.replace(/^\//, "").replace(/\.md$/, ""));

  // The HTML routes, as the `page` path parameter would carry them. Home is
  // `/` rather than a path segment, so it is described instead of enumerated.
  const htmlRoutes = routes.filter((r) => r !== "/").map((r) => r.replace(/^\//, ""));

  const errorSchema = {
    type: "object",
    required: ["error"],
    description:
      "The structured error every machine-readable route returns. Also returned by any page URL requested with `Accept: application/json`.",
    properties: {
      error: {
        type: "object",
        required: ["status", "code", "message"],
        properties: {
          status: { type: "integer", description: "HTTP status code.", examples: [404] },
          code: {
            type: "string",
            description: "Stable, machine-comparable error code.",
            examples: ["not_found"],
          },
          message: { type: "string", description: "One-line human-readable summary." },
          hint: {
            type: "string",
            description: "How to recover, naming the routes that do exist.",
          },
          documentation: {
            type: "string",
            format: "uri",
            description: "Where the documentation set starts.",
          },
          resources: {
            type: "object",
            additionalProperties: { type: "string", format: "uri" },
            description: "The site's entry points, keyed by name.",
          },
        },
      },
    },
  };

  const spec = {
    openapi: "3.1.0",
    info: {
      title: `${SITE_TITLE} content API`,
      summary: "The machine-readable surface of the Jostraca documentation site.",
      description: [
        "Jostraca is a code and project generator distributed as an npm package",
        "and a Go module. It is a library, not a hosted service, so there is no",
        "product API to call and this document does not pretend otherwise.",
        "",
        "What it describes is the content API this site serves to programs:",
        "every page has a markdown twin, an index enumerates the corpus, a",
        "version document states what the site runs, and errors come back as",
        "JSON rather than HTML.",
        "",
        "Read `/llms.txt` first: it is the smallest complete map of the site.",
        "To use Jostraca itself, install the package — see `externalDocs`.",
      ].join("\n"),
      // The content API's own version, not the generator's. See
      // CONTENT_API_VERSION in consts.ts for which one moves when.
      version: CONTENT_API_VERSION,
      license: { name: "MIT", identifier: "MIT" },
      contact: { name: "Jostraca issues", url: `${GITHUB_REPO}/issues` },
    },
    externalDocs: {
      description: `The generator itself: both implementations, published as npm \`jostraca\` and Go module \`${GO_MODULE}\`.`,
      url: GITHUB_REPO,
    },
    servers: [{ url: origin, description: "Production" }],
    tags: [
      { name: "index", description: "Documents that enumerate the site for an agent." },
      { name: "content", description: "The documentation itself, as markdown." },
      { name: "meta", description: "Documents describing the site rather than the product." },
    ],
    paths: {
      "/llms.txt": {
        get: {
          operationId: "getSiteIndex",
          tags: ["index"],
          summary: "The site index, written for agents",
          description:
            "A short markdown index of every documentation page and how-to guide, each linked to its markdown twin, plus when to reach for Jostraca and where the package lives. Start here.",
          responses: {
            "200": {
              description: "The index.",
              content: { "text/plain": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/llms-full.txt": {
        get: {
          operationId: "getFullCorpus",
          tags: ["index"],
          summary: "Every page, concatenated",
          description:
            "The entire documentation corpus in one plain-text document, for a caller that would rather make one request than follow the index. Large; prefer `getSiteIndex` plus `getPageMarkdown` when you know what you need.",
          responses: {
            "200": {
              description: "The whole corpus.",
              content: { "text/plain": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/versions.json": {
        get: {
          operationId: "getVersions",
          tags: ["meta"],
          summary: "What this site runs and what it documents",
          description:
            "The `jostraca` version this site executes its examples against, the size of each surface, and the markdown convention. The running version and the documented version are stated separately because the synced documentation can be ahead of the published package.",
          responses: {
            "200": {
              description: "The version document.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Versions" } },
              },
            },
          },
        },
      },
      "/openapi.json": {
        get: {
          operationId: "getOpenApiSpec",
          tags: ["meta"],
          summary: "This document",
          description: "The OpenAPI 3.1 description of this site's machine surface.",
          responses: {
            "200": {
              description: "The specification.",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/robots.txt": {
        get: {
          operationId: "getRobotsTxt",
          tags: ["meta"],
          summary: "Crawler policy",
          description:
            "The robots policy for this site, which also names the sitemap. Nothing here is disallowed to well-behaved agents.",
          responses: {
            "200": {
              description: "The policy.",
              content: { "text/plain": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/sitemap-index.xml": {
        get: {
          operationId: "getSitemapIndex",
          tags: ["meta"],
          summary: "Sitemap index",
          description: "The XML sitemap index for every page on this site.",
          responses: {
            "200": {
              description: "The sitemap index.",
              content: { "application/xml": { schema: { type: "string" } } },
            },
          },
        },
      },
      "/{page}.md": {
        get: {
          operationId: "getPageMarkdown",
          tags: ["content"],
          summary: "One page, as markdown",
          description:
            "The markdown twin of a page. Identical bytes to sending `Accept: text/markdown` to the page's own URL, and the form to prefer when you can build the path yourself. Answers cross-origin.",
          parameters: [
            {
              name: "page",
              in: "path",
              required: true,
              description:
                "The page path without its leading slash and without the `.md` suffix, for example `docs/tutorial`. The enumeration is the complete set of pages that have a twin.",
              schema: { type: "string", enum: twins },
              examples: {
                tutorial: { value: "docs/tutorial", summary: "The tutorial" },
                components: {
                  value: "docs/reference-components",
                  summary: "Every component and its props",
                },
              },
            },
          ],
          responses: {
            "200": {
              description: "The page, as markdown.",
              content: { "text/markdown": { schema: { type: "string" } } },
            },
            "404": {
              description:
                "No such page, in whichever representation the caller asked for: JSON under `Accept: application/json`, the designed HTML page under `Accept: text/html`, and markdown otherwise — including for a caller that named nothing.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Error" } },
                "text/markdown": { schema: { type: "string" } },
                "text/html": { schema: { type: "string" } },
              },
            },
          },
        },
      },
      "/{page}": {
        get: {
          operationId: "getPage",
          tags: ["content"],
          summary: "One page, in the representation you ask for",
          description:
            "A page URL. What comes back depends on `Accept`: `text/markdown` returns the same bytes as the `.md` twin with `Vary: Accept`, `application/json` turns an error into the structured shape, and anything else returns the HTML page. A caller that names nothing gets markdown for errors, because that is readable either way.",
          parameters: [
            {
              name: "page",
              in: "path",
              required: true,
              description:
                "The page path without its leading slash, for example `docs/tutorial`. The home page is `/` itself and is not in this enumeration.",
              schema: { type: "string", enum: htmlRoutes },
            },
            {
              name: "Accept",
              in: "header",
              required: false,
              description: "The representation you want back.",
              schema: {
                type: "string",
                enum: ["text/markdown", "text/html", "application/json"],
                default: "text/html",
              },
            },
          ],
          responses: {
            "200": {
              description: "The page.",
              content: {
                "text/html": { schema: { type: "string" } },
                "text/markdown": { schema: { type: "string" } },
              },
            },
            "404": {
              description:
                "No such page, in whichever representation the caller asked for: JSON under `Accept: application/json`, the designed HTML page under `Accept: text/html`, and markdown otherwise — including for a caller that named nothing.",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Error" } },
                "text/markdown": { schema: { type: "string" } },
                "text/html": { schema: { type: "string" } },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Error: errorSchema,
        Versions: {
          type: "object",
          required: ["generator", "surfaces"],
          description: "What this site runs, and how big each surface is.",
          properties: {
            $comment: { type: "string" },
            generator: {
              type: "object",
              required: ["npm", "version"],
              properties: {
                npm: { type: "string", description: "The npm package name.", examples: ["jostraca"] },
                version: {
                  type: "string",
                  description: "The exact version this site runs its examples against.",
                },
                go_module: { type: "string", description: "The Go module path of the port." },
                source: { type: "string", format: "uri" },
              },
            },
            surfaces: {
              type: "object",
              properties: {
                docs: { $ref: "#/components/schemas/SurfaceCount" },
                howto: { $ref: "#/components/schemas/SurfaceCount" },
                llms: {
                  type: "array",
                  items: { type: "string", format: "uri" },
                  description: "The index documents.",
                },
              },
            },
            markdown: { type: "string", description: "The markdown-twin convention, in one line." },
          },
        },
        SurfaceCount: {
          type: "object",
          required: ["count", "url"],
          properties: {
            count: { type: "integer", description: "How many pages the surface holds." },
            url: { type: "string", format: "uri" },
          },
        },
      },
    },
    "x-machine-surface": {
      // Not part of OpenAPI, and deliberately additive: an agent that reads
      // only this key still learns the two things it most needs.
      startHere: `${origin}/llms.txt`,
      markdownTwins: {
        convention: "Append `.md` to any page path, or send `Accept: text/markdown` to the page URL.",
        count: twins.length,
      },
      source: SITE_REPO,
    },
  };

  return new Response(JSON.stringify(spec, null, 2) + "\n", {
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Public by definition: an agent discovering the surface should not
      // need a proxy. The Worker adds this for machine paths too; setting it
      // here means the file is correct even served straight from assets.
      "access-control-allow-origin": "*",
    },
  });
};
