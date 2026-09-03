import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

// The documentation set, SYNCED from jostraca/jostraca's docs/*.md by
// tools/sync-docs.mjs and committed. Nothing here is authored in this
// repository — see that file's header, and AGENTS.md, for why.
const docs = defineCollection({
  loader: glob({ base: "./src/content/docs", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    // Sidebar grouping. Diátaxis, as upstream organises it: learning,
    // task, information and understanding oriented.
    section: z.enum(["Start", "Tutorial", "Reference", "Understanding"]),
    order: z.number().default(100),
    // The upstream path this page was generated from. Rendered as a
    // "source" link, so a reader who wants to correct the page is sent to
    // the file that actually decides it.
    source: z.string(),
  }),
});

// The how-to guides, synced from docs/how-to/<slug>.md upstream and served
// at /how-to/<slug>. Group slugs match HOWTO_GROUPS in consts.ts, which owns
// display names, blurbs and ordering, and match the list that upstream's
// ts/test/docs.test.ts enforces on the guides' own frontmatter.
const howto = defineCollection({
  loader: glob({ base: "./src/content/howto", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    group: z.enum([
      "install",
      "compose",
      "templates",
      "reuse",
      "regenerate",
      "files",
      "embed",
    ]),
    order: z.number().default(100),
    source: z.string(),
  }),
});

export const collections = { docs, howto };
