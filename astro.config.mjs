// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  site: "https://jostraca.dev",
  // Fully static: nothing renders at request time. The Worker in front of
  // the assets (src/worker.ts) does the per-request work — content
  // negotiation, JSON errors, the canonical-host redirect.
  output: "static",
  integrations: [mdx(), sitemap()],
  // Every heading in markdown/MDX gets an id and a linkable anchor.
  markdown: {
    // Two Shiki themes, selected by CSS rather than baked in. With a single
    // theme every fenced block on a synced page renders dark, while the
    // authored pages' own <pre> follows --bg-code and renders light: one
    // site with two kinds of code block, which reads as a mistake because
    // it is one. `defaultColor: false` makes Shiki emit both palettes as
    // custom properties and leaves the choice to global.css, next to the
    // tokens that make the same choice for everything else.
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    },
    rehypePlugins: [
      rehypeSlug,
      [
        rehypeAutolinkHeadings,
        {
          behavior: "append",
          properties: {
            class: "heading-anchor",
            // NOT aria-hidden + tabindex="-1", which is the usual pairing
            // and which global.css contradicts: it reveals the anchor on
            // :focus-visible, a state an element with tabindex="-1" can
            // never enter. So the rule was dead and the control was
            // reachable by mouse only. Exposed instead, with a name --
            // the visible text is "#", which a screen reader announces as
            // punctuation or not at all.
            ariaLabel: "Permalink to this section",
          },
          content: { type: "text", value: "#" },
        },
      ],
    ],
  },
  adapter: cloudflare({
    imageService: "compile",
    platformProxy: { enabled: true },
  }),
});
