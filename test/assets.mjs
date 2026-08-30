// A stand-in for the Cloudflare ASSETS binding, backed by ./dist.
//
// The Worker's behaviour is almost entirely about what it does around asset
// serving — negotiate, decorate, recover — so testing it needs an asset
// server, not a network. This is that server, matching the two settings
// wrangler.json actually sets:
//
//   html_handling: "auto-trailing-slash" (the default) — /why redirects to
//     /why/, which serves dist/why/index.html.
//   not_found_handling: "none" — a miss is a bare 404, and the Worker owns
//     what the caller sees.

import { readFileSync, statSync } from 'node:fs'
import { join, normalize } from 'node:path'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

const isFile = (p) => {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

const contentType = (p) => {
  const dot = p.lastIndexOf('.')
  return (dot === -1 ? null : TYPES[p.slice(dot)]) ?? 'application/octet-stream'
}

/**
 * @param {string} dist  the built site
 * @param {(pathname: string) => boolean} [hide]  pretend these do not exist,
 *   so a test can exercise a page whose markdown twin is missing
 */
export function makeAssets(dist, hide = () => false) {
  return {
    async fetch(input) {
      const request = input instanceof Request ? input : new Request(input)
      const url = new URL(request.url)
      const pathname = decodeURIComponent(url.pathname)
      const miss = () => new Response('', { status: 404 })

      if (hide(pathname)) return miss()

      // No escaping the site root.
      const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
      const direct = join(dist, rel)

      if (!pathname.endsWith('/') && isFile(direct)) {
        const body = request.method === 'HEAD' ? null : readFileSync(direct)
        return new Response(body, {
          status: 200,
          headers: { 'content-type': contentType(direct), 'cache-control': 'public, max-age=0, must-revalidate' },
        })
      }

      const index = join(dist, rel, 'index.html')
      if (isFile(index)) {
        if (!pathname.endsWith('/')) {
          return new Response(null, { status: 307, headers: { location: `${pathname}/` } })
        }
        const body = request.method === 'HEAD' ? null : readFileSync(index)
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }

      return miss()
    },
  }
}
