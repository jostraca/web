// Global site data — imported anywhere with `import { ... } from '../consts'`.

export const SITE_TITLE = "Jostraca";
export const SITE_TAGLINE = "A code generator you can run twice";
export const SITE_DESCRIPTION =
  "Jostraca builds file trees from components. You declare Project, Folder, " +
  "File and Content in a define phase; a build phase writes the result. " +
  "Because the whole intended output is known before a byte is written, a " +
  "second run can preserve, present, diff or merge against the code a human " +
  "edited in between.";

// The site's own domain. Assumed, not confirmed: the wrangler routes and
// the sitemap are the only places it matters, and both read it from here.
export const SITE_HOST = "jostraca.dev";
export const SITE_URL = `https://${SITE_HOST}`;

export const GITHUB_REPO = "https://github.com/jostraca/jostraca";

// This site's own repository. Separate from the generator's, and named
// because the two are deployed and versioned independently.
export const SITE_REPO = "https://github.com/jostraca/web";
export const NPM_PACKAGE = "https://www.npmjs.com/package/jostraca";
export const GO_MODULE = "github.com/jostraca/jostraca/go";
export const GO_PKG_DOC = "https://pkg.go.dev/github.com/jostraca/jostraca/go";

// The exact version of the `jostraca` package this site runs and documents
// against. Read from package.json rather than restated — the pin is one
// fact and it lives in one place.
export { version as JOSTRACA_VERSION } from "jostraca/package.json";

// Who writes it. Open source projects say so; products don't.
export const AUTHOR = {
  name: "Richard Rodger",
  url: "https://richardrodger.com",
  github: "https://github.com/rjrodger",
};

// Primary navigation.
export const NAV: { href: string; label: string }[] = [
  { href: "/why", label: "Why" },
  { href: "/docs", label: "Docs" },
  { href: "/docs/tutorial", label: "Tutorial" },
  { href: "/how-to", label: "How to" },
  { href: "/docs/reference-components", label: "Reference" },
  { href: "/docs/explanation", label: "Explanation" },
];

// The how-to group taxonomy: slug (as synced guides declare it), display
// name, one-line blurb, in display order. The slugs are the same six the
// generator repository's `ts/test/docs.test.ts` enforces on frontmatter; a
// guide declaring anything else fails the content-collection schema here
// and the docs suite there.
export const HOWTO_GROUPS: { slug: string; name: string; blurb: string }[] = [
  {
    slug: "compose",
    name: "Compose the output tree",
    blurb: "Declaring folders, files, and the content that goes inside them.",
  },
  {
    slug: "templates",
    name: "Templates and fragments",
    blurb: "Filling files from a data model, and from template files on disk.",
  },
  {
    slug: "reuse",
    name: "Reusable components",
    blurb: "Factoring a generator into pieces you call more than once.",
  },
  {
    slug: "regenerate",
    name: "Regenerating over existing files",
    blurb: "Running the generator again over code a person has edited.",
  },
  {
    slug: "files",
    name: "Files, copying and permissions",
    blurb: "Getting existing assets into the output, and setting how they land.",
  },
  {
    slug: "embed",
    name: "Embedding Jostraca",
    blurb: "Driving the generator from your own tool, in memory or on disk.",
  },
];

// The components, as the landing page lists them. Each is a fact the
// reference states in full; this is the one-line version, and it links there
// rather than repeating the props.
//
// THE NAMES ARE HELD TO THE PACKAGE. test/examples.test.mjs imports the
// pinned build and asserts this set matches its exported components exactly,
// so a component added or renamed upstream fails here rather than quietly
// leaving the page a version behind.
export const COMPONENTS: { name: string; blurb: string }[] = [
  { name: "Project", blurb: "the root of one generated tree" },
  { name: "Folder", blurb: "a directory, nested as deep as you like" },
  { name: "File", blurb: "a file, with an optional POSIX mode" },
  { name: "Content", blurb: "text, with model values substituted in" },
  { name: "Line", blurb: "text, with the newline supplied for you" },
  { name: "Fragment", blurb: "a template file read in from disk" },
  { name: "Slot", blurb: "a named region of a fragment you fill" },
  { name: "Inject", blurb: "content placed between markers in a file that exists" },
  { name: "Copy", blurb: "a file or a whole directory, templated on the way through" },
  { name: "List", blurb: "one block of content per item in an array" },
];

// The existing-file modes, the reason the project exists. Named here because
// the landing page argues them and the reference specifies them.
export const MODES: { name: string; blurb: string }[] = [
  { name: "write", blurb: "overwrite the file (the default)" },
  { name: "preserve", blurb: "overwrite, keeping the old bytes beside it" },
  {
    name: "present",
    blurb:
      "leave the file alone and write the new version next to it (needs write: false)",
  },
  { name: "diff", blurb: "write an annotated two-way diff instead" },
  { name: "merge", blurb: "three-way merge against the last generate" },
];
