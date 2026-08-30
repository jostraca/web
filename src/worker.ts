// The request Worker in front of the static site.
//
// The site is `output: "static"` and every page is prerendered, so almost
// everything here is a pass-through to the ASSETS binding. What it adds is the
// handful of behaviours a static asset server cannot express, all of them for
// machine callers:
//
//   1. Markdown content negotiation (acceptmarkdown.com). `Accept:
//      text/markdown` on a page URL serves that page's markdown twin from the
//      same URL, with `Vary: Accept` so a CDN keeps the two variants apart.
//      The twins are generated from the built HTML by tools/gen-markdown.mjs.
//   2. Structured JSON errors on the machine-readable surface. An agent
//      probing a .json path or /.well-known/ gets an error object with a code,
//      a message and a hint, not an HTML page it cannot read.
//   3. A recoverable 404. Nonexistent paths already returned a real 404; this
//      gives that response a body the caller can act on — markdown with the
//      site's entry points for tools, the designed HTML page for browsers.
//   4. 405 on writes and 406 on an unsatisfiable Accept, both as JSON.
//
// Why a hand-written Worker rather than Astro middleware: the Cloudflare
// adapter short-circuits prerendered routes straight to ASSETS before the
// middleware chain runs (see `handle()` in its server entrypoint), so
// middleware never sees a request for a static page — which is every page
// here. wrangler.json's `main` points at this file instead of the adapter's
// generated dist/_worker.js, and `assets.run_worker_first` lists the paths
// that need it: pages and machine-readable files, never the hashed bundles
// or fonts.

/**
 * The canonical host. `www.jostraca.dev` is a second custom domain on this
 * same Worker (see wrangler.json), so without a redirect both hosts serve
 * every page and the apex is canonical only by `<link rel="canonical">` —
 * which search engines honour and nothing else does. One permanent redirect
 * makes it canonical to anything that keys on the host.
 */
const CANONICAL_HOST = "jostraca.dev";

/** Paths the Worker never handles, even if run_worker_first sends them here. */
const ASSET_PREFIXES = ["/_astro/", "/fonts/", "/brand/"];

/** Extensions that are their own representation and are never negotiated. */
const NEVER_NEGOTIATED = /\.[a-z0-9]+$/i;

/**
 * Where a caller that got lost should look next. src/pages/404.astro renders
 * the same list, so the HTML and markdown answers to a 404 offer the same
 * recovery routes.
 */
export const ENTRY_POINTS: [string, string][] = [
  ["/", "what Jostraca is, in one page"],
  ["/why", "the case for a generator you can run twice"],
  ["/docs", "the documentation set"],
  ["/docs/tutorial", "a first generator, written step by step"],
  ["/how-to", "the task guides, by group"],
  ["/docs/reference-components", "every component, with its props"],
  ["/docs/explanation", "why the define and build phases are separate"],
  ["/llms.txt", "the site index, written for agents"],
  ["/versions.json", "what this site runs and what it documents"],
];

/**
 * Files that describe this site to other programs. They are public by
 * definition, so they answer cross-origin — a page that wants to read
 * /versions.json or a markdown twin should not need a proxy to do it.
 */
function isPublicData(pathname: string): boolean {
  return isMachinePath(pathname) || /\.(txt|md)$/i.test(pathname);
}

type ErrorFormat = "json" | "markdown" | "html";

interface MediaRange {
  type: string;
  subtype: string;
  q: number;
}

/**
 * Parse an Accept header into media ranges. Malformed parameters are ignored
 * rather than rejected: a caller with a broken Accept still gets a page.
 */
export function parseAccept(header: string | null): MediaRange[] {
  if (!header) return [];
  const ranges: MediaRange[] = [];
  for (const part of header.split(",")) {
    const [raw, ...params] = part.split(";");
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    const slash = value.indexOf("/");
    const type = slash === -1 ? value : value.slice(0, slash);
    const subtype = slash === -1 ? "*" : value.slice(slash + 1);
    let q = 1;
    for (const param of params) {
      const eq = param.indexOf("=");
      if (eq === -1) continue;
      if (param.slice(0, eq).trim().toLowerCase() !== "q") continue;
      const parsed = Number.parseFloat(param.slice(eq + 1).trim());
      if (Number.isFinite(parsed)) q = Math.min(Math.max(parsed, 0), 1);
    }
    ranges.push({ type, subtype, q });
  }
  return ranges;
}

/**
 * The quality the caller assigned to one media type, counting wildcards.
 * RFC 9110 §12.5.1: the most specific matching range wins.
 */
export function quality(ranges: MediaRange[], mediaType: string): number {
  const [type, subtype] = mediaType.toLowerCase().split("/");
  let best = -1;
  let bestRank = -1;
  for (const range of ranges) {
    let rank: number;
    if (range.type === type && range.subtype === subtype) rank = 3;
    else if (range.type === type && range.subtype === "*") rank = 2;
    else if (range.type === "*" && range.subtype === "*") rank = 1;
    else continue;
    if (rank > bestRank) {
      bestRank = rank;
      best = range.q;
    }
  }
  return best === -1 ? 0 : best;
}

/**
 * The quality assigned by an exact `type/subtype` range only. A caller that
 * sent nothing but a bare wildcard range has not asked for markdown or JSON;
 * it has said it will take whatever the server thinks is right, and for a page
 * that is HTML.
 */
export function explicitQuality(ranges: MediaRange[], mediaType: string): number {
  const [type, subtype] = mediaType.toLowerCase().split("/");
  let best = -1;
  for (const range of ranges) {
    if (range.type === type && range.subtype === subtype) best = Math.max(best, range.q);
  }
  return best === -1 ? 0 : best;
}

/** Did the caller ask, by name, for markdown in preference to HTML? */
export function wantsMarkdown(accept: string | null): boolean {
  const ranges = parseAccept(accept);
  const md = explicitQuality(ranges, "text/markdown");
  return md > 0 && md >= quality(ranges, "text/html");
}

/** Paths whose errors are always JSON, because only a machine asks for them. */
export function isMachinePath(pathname: string): boolean {
  return pathname.startsWith("/.well-known/") || /\.json$/i.test(pathname);
}

/**
 * Which representation an error should take. Order matters: a named
 * preference beats a wildcard, and a caller that named nothing (bare `curl`,
 * a default `fetch`) gets markdown, which is the readable-and-parseable
 * answer. Browsers name text/html and get the designed page.
 */
export function errorFormat(accept: string | null, pathname: string): ErrorFormat {
  if (isMachinePath(pathname)) return "json";
  const ranges = parseAccept(accept);
  const json = explicitQuality(ranges, "application/json");
  const md = explicitQuality(ranges, "text/markdown");
  const html = quality(ranges, "text/html");
  if (json > 0 && json >= quality(ranges, "text/markdown") && json >= html) return "json";
  if (md > 0 && md >= html) return "markdown";
  if (explicitQuality(ranges, "text/html") > 0 || explicitQuality(ranges, "application/xhtml+xml") > 0) {
    return "html";
  }
  return "markdown";
}

/**
 * The markdown twin for a page path, or null if the path is not a page.
 * `/` is `/index.md`; `/docs/tutorial/` is `/docs/tutorial.md`.
 */
export function markdownTwin(pathname: string): string | null {
  if (ASSET_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  // A /.well-known/ file is a protocol document, not a page (RFC 8615).
  if (pathname.startsWith("/.well-known/")) return null;
  const trimmed = pathname.replace(/\/+$/, "");
  if (trimmed === "") return "/index.md";
  const last = trimmed.slice(trimmed.lastIndexOf("/") + 1);
  if (NEVER_NEGOTIATED.test(last)) return null;
  return `${trimmed}.md`;
}

interface ErrorBody {
  status: number;
  code: string;
  message: string;
  hint: string;
}

function resources(origin: string): Record<string, string> {
  return Object.fromEntries(ENTRY_POINTS.map(([href]) => [href.replace(/^\//, "") || "home", origin + href]));
}

function jsonError(origin: string, error: ErrorBody, extra?: HeadersInit): Response {
  const body = {
    error: {
      ...error,
      documentation: `${origin}/docs`,
      resources: resources(origin),
    },
  };
  return new Response(JSON.stringify(body, null, 2) + "\n", {
    status: error.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      vary: "Accept",
      // The whole point of this body is that a program can recover from it.
      // Successful public JSON answers cross-origin; an error that does not
      // is unreadable by a browser client at exactly the moment it needs the
      // code and the links.
      "access-control-allow-origin": "*",
      ...(extra ?? {}),
    },
  });
}

function markdownErrorBody(origin: string, error: ErrorBody, pathname: string): string {
  const links = ENTRY_POINTS.map(([href, what]) => `- [${href}](${origin}${href}) — ${what}`).join("\n");
  return `# ${error.status} ${error.message}

\`${pathname}\` is not a page on this site. Error code: \`${error.code}\`.

${error.hint}

## Where to look instead

${links}

Every page on this site is also available as markdown: request it with
\`Accept: text/markdown\`, or append \`.md\` to the path.
`;
}

function markdownError(origin: string, error: ErrorBody, pathname: string): Response {
  return new Response(markdownErrorBody(origin, error, pathname), {
    status: error.status,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store",
      vary: "Accept",
      "access-control-allow-origin": "*",
    },
  });
}

async function htmlError(
  env: Env,
  origin: string,
  error: ErrorBody,
  pathname: string,
): Promise<Response> {
  const page = await env.ASSETS.fetch(new Request(`${origin}/404.html`, { method: "GET" }));
  if (page.status === 200) {
    const response = new Response(page.body, {
      status: error.status,
      headers: page.headers,
    });
    response.headers.set("content-type", "text/html; charset=utf-8");
    response.headers.set("cache-control", "no-store");
    response.headers.set("vary", "Accept");
    return response;
  }
  // The designed page is missing from the build. Markdown still recovers.
  return markdownError(origin, error, pathname);
}

async function respondWithError(
  env: Env,
  request: Request,
  url: URL,
  error: ErrorBody,
): Promise<Response> {
  const format = errorFormat(request.headers.get("accept"), url.pathname);
  if (format === "json") return jsonError(url.origin, error);
  if (format === "html") return htmlError(env, url.origin, error, url.pathname);
  return markdownError(url.origin, error, url.pathname);
}

const NOT_FOUND = (pathname: string): ErrorBody => ({
  status: 404,
  code: "not_found",
  message: "Not Found",
  hint:
    `Nothing is published at ${pathname}. This site is documentation for Jostraca, a code ` +
    "and project generator; start from /llms.txt for the machine-readable index, or /docs for " +
    "the documentation set. Every page is also available as markdown.",
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // One host, before anything else looks at the path.
    if (url.hostname === `www.${CANONICAL_HOST}`) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }

    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { allow: "GET, HEAD, OPTIONS", vary: "Accept" },
      });
    }

    // The site is read-only. Say so in a shape a client can branch on.
    if (method !== "GET" && method !== "HEAD") {
      return jsonError(
        url.origin,
        {
          status: 405,
          code: "method_not_allowed",
          message: "Method Not Allowed",
          hint:
            `${method} is not supported. jostraca.dev is a read-only documentation site: every ` +
            "endpoint answers GET and HEAD. Jostraca generates files in your own process, from " +
            "the npm package or the Go module; nothing here runs it for you.",
        },
        { allow: "GET, HEAD, OPTIONS" },
      );
    }

    if (ASSET_PREFIXES.some((p) => url.pathname.startsWith(p))) {
      return env.ASSETS.fetch(request);
    }

    const twin = markdownTwin(url.pathname);
    const accept = request.headers.get("accept");
    let twinMissing = false;

    // 1. The caller named markdown. Serve the twin from this same URL.
    if (twin && wantsMarkdown(accept)) {
      const md = await env.ASSETS.fetch(new Request(`${url.origin}${twin}`, { method }));
      if (md.status === 200) {
        const response = new Response(md.body, { status: 200, headers: md.headers });
        response.headers.set("content-type", "text/markdown; charset=utf-8");
        response.headers.set("vary", "Accept, Accept-Encoding");
        response.headers.set("content-location", twin);
        // This branch returns before the decoration in step 4, so it has to
        // set CORS itself. The body is the same markdown a direct request
        // for `twin` would serve, and that path DOES get the header (via
        // isPublicData's .md rule) -- so without this the negotiated
        // surface, which is the one this Worker exists for, was the one
        // surface a cross-origin reader could not actually read. The fetch
        // succeeds and the body is withheld from the caller.
        response.headers.set("access-control-allow-origin", "*");
        return response;
      }
      twinMissing = true;
    }

    // 2. Ordinary asset serving.
    //
    //    Note what does NOT happen here: a request for an existing page with
    //    `Accept: application/json` is served the HTML rather than refused.
    //    RFC 9110 §12.5.1 permits exactly that — "the server SHOULD return
    //    406 ... but MAY instead disregard the Accept header field" — and
    //    being lenient is the right call for a documentation site, where
    //    plenty of tooling sends a careless Accept and wants the page. The
    //    406 below is for the narrower case where the caller has ruled out
    //    every representation that exists.
    const asset = await env.ASSETS.fetch(request);

    if (asset.status === 404) {
      // No markdown and no page: the path is wrong, which is a 404 and not a
      // failed negotiation. The error itself is still negotiated.
      return respondWithError(env, request, url, NOT_FOUND(url.pathname));
    }

    // 3. The page exists but has no markdown twin, and markdown was the only
    //    thing the caller said it would take. Saying so beats sending HTML it
    //    has already told us it cannot read.
    if (twinMissing && quality(parseAccept(accept), "text/html") === 0) {
      return jsonError(url.origin, {
        status: 406,
        code: "not_acceptable",
        message: "Not Acceptable",
        hint:
          `No markdown representation exists for ${url.pathname}. Documentation pages have ` +
          "one; generated files such as /llms.txt and /sitemap-index.xml are served in their " +
          "own format. Retry without restricting Accept.",
      });
    }

    // 4. Decorate what was served. A path with a markdown twin is a page and
    //    gets marked negotiable, so a CDN keeps the two variants apart and a
    //    reader can find the other one; anything else on the machine surface
    //    is data, and gets the CORS header it cannot carry itself.
    if (!twin && !isPublicData(url.pathname)) return asset;

    const response = new Response(asset.body, { status: asset.status, headers: asset.headers });
    if (twin) {
      response.headers.set("vary", "Accept, Accept-Encoding");
      response.headers.append("link", `<${twin}>; rel="alternate"; type="text/markdown"`);
    } else {
      response.headers.set("access-control-allow-origin", "*");
    }
    return response;
  },
};
