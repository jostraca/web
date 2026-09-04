// Global site data -  imported anywhere with `import { ... } from '../consts'`.

export const SITE_TITLE = "Jostraca";
export const SITE_TAGLINE = "A code generator you can run twice";
export const SITE_DESCRIPTION =
  "Jostraca builds file trees from components. You declare Project, Folder, " +
  "File and Content in a define phase; a build phase writes the result. " +
  "Because the whole intended output is known before a byte is written, a " +
  "second run can preserve, present, diff or merge against the code a human " +
  "edited in between.";

// The site's own domain, confirmed by the maintainer. Six files name it --
// this constant, the wrangler routes, and four literals that cannot import
// it (see AGENTS.md, "The domain"), so grep the string rather than trusting
// this to cover them.
export const SITE_HOST = "jostraca.org";
export const SITE_URL = `https://${SITE_HOST}`;

// The version of the CONTENT API this site serves -- /openapi.json's
// `info.version`. Semver over the surface described there: bump the minor for
// a new operation or field, the major for a breaking change to an existing
// one. Deliberately NOT the package pin: `info.version` identifies the API
// document, so tying it to JOSTRACA_VERSION let the surface change while the
// advertised version stood still, and let a package bump announce an API
// change that never happened.
export const CONTENT_API_VERSION = "1.0.0";

export const GITHUB_REPO = "https://github.com/jostraca/jostraca";

// This site's own repository. Separate from the generator's, and named
// because the two are deployed and versioned independently.
export const SITE_REPO = "https://github.com/jostraca/web";
export const NPM_PACKAGE = "https://www.npmjs.com/package/jostraca";
export const GO_MODULE = "github.com/jostraca/jostraca/go";
export const GO_PKG_DOC = "https://pkg.go.dev/github.com/jostraca/jostraca/go";

// The exact version of the `jostraca` package this site runs and documents
// against. Read from package.json rather than restated -  the pin is one
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
  // Second, not last. Installing is the first thing a reader who is
  // convinced wants to do, and until now the only routes to it were the
  // landing page and the how-to index. The target is the group anchor
  // rather than one stack's guide: picking TypeScript or Go for the reader
  // is the choice this project does not make anywhere else.
  { href: "/how-to#install", label: "Install" },
  { href: "/docs", label: "Docs" },
  { href: "/docs/tutorial", label: "Tutorial" },
  { href: "/how-to", label: "How to" },
  { href: "/docs/reference-components", label: "Reference" },
  { href: "/docs/explanation", label: "Explanation" },
];

// The how-to group taxonomy: slug (as synced guides declare it), display
// name, one-line blurb, in display order. The slugs are the same seven the
// generator repository's `ts/test/docs.test.ts` enforces on frontmatter; a
// guide declaring anything else fails the content-collection schema here
// and the docs suite there.
export const HOWTO_GROUPS: { slug: string; name: string; blurb: string }[] = [
  {
    slug: "install",
    name: "Install",
    blurb: "Getting Jostraca into a project, in either implementation.",
  },
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

// The implementations. The landing page states how many there are, and a
// count typed into prose goes stale silently: this is the same reason MODES
// and COMPONENTS live here rather than in the page that argues them.
//
// `install` is the guide that gets each one into a project. The hero links
// both, so a reader who has decided arrives at the command rather than at a
// table of contents.
export const STACKS: { name: string; blurb: string; install: string }[] = [
  {
    name: "TypeScript",
    blurb: "the npm package, and the canonical source",
    install: "/how-to/install-typescript",
  },
  {
    name: "Go",
    blurb: "the module, a port held to the same shared corpus",
    install: "/how-to/install-go",
  },
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
