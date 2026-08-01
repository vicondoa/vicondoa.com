# AGENTS.md

Guidance for AI agents working on vicondoa.com. These rules apply to blog
posts, page copy, commit messages, pull request descriptions, and any other
prose written for this repository.

## Voice

Always use my language. When I supply a draft, notes, or source text, keep my
wording, my phrasing, and my sentence structure. Fix grammar, tighten obvious
redundancy, and organize the material, but do not rewrite my sentences into
your own voice. If a passage is unclear, ask instead of inventing a
replacement. Do not add ideas, opinions, examples, or conclusions that I did
not provide.

## Characters

Write ASCII only. Use a plain hyphen, straight quotes, and three periods
instead of typographic punctuation.

Never use an em-dash. Restructure the sentence, or use a comma, a colon, or a
period instead. The same applies to en-dashes, curly quotes, curly
apostrophes, and ellipsis characters.

Non-ASCII characters are acceptable only when there is genuinely no other way
to express something, such as a quoted proper name, a required code sample, a
technical symbol with no ASCII equivalent, or a decorative glyph in the site
chrome. Prose never qualifies. Dashes never qualify, and `make lint-dashes`
enforces that.

## Banned patterns

Do not use these constructions. They read as machine-generated.

- "It's not x, it's y" and every variant, including "this isn't x, it's y" and
  "not just x, but y".
- "No x, no y" and "not x, not y" parallel constructions.
- Single-sentence paragraphs used for dramatic effect. Group related sentences
  into real paragraphs that develop one idea. A single-sentence paragraph is
  acceptable only when the sentence genuinely stands alone, and it should be
  rare.
- Rhetorical questions asked so the next line can answer them.
- Openings that restate the title or announce what the piece will cover.
- Closings that summarize what was already said, or that end on an inspirational
  note.
- Filler intensifiers such as "truly", "deeply", "incredibly", "seamlessly",
  "game-changing", "revolutionary", "unlock", "leverage" as a verb, "delve",
  "dive into", "landscape", "realm", "tapestry", and "at the end of the day".
- Bulleted lists where prose would work. Reserve lists for genuinely
  enumerable items.
- Emoji, and headings decorated with symbols.
- Hedging pileups such as "it's worth noting that" and "it's important to
  remember that".

## Structure

Prefer paragraphs over lists and fragments. A paragraph should carry a
complete thought and usually runs three to six sentences.

Use sentence case for headings. Keep heading levels flat, starting at `##`
inside a post, because the page supplies the `h1`.

Write in first person, past or present tense, and stay consistent within a
piece.

## Markdown conventions

Wrap prose at 80 columns. Prettier owns formatting, so let `make format` fix it
rather than hand-aligning text.

Post frontmatter is validated by `src/content.config.ts`. The `description`
field appears on post cards, RSS, and social metadata, so write it as a real
sentence rather than a label.

Post files live under `src/content/blog/YYYY/MM/`, matching the `publishedAt`
date in UTC. `make check` fails if a post sits in the wrong month.

A post with `draft: true` is hidden from production but appears on Cloudflare
branch previews, so drafts can be reviewed on the deployed site. Run
`make preview` to reproduce that build locally.

## Linking to code

When a post explains how something was built, link to the code that does it.

Always link by full 40-character commit SHA. Never link to a branch, a tag, or
a default branch path, because those move and the post then describes code that
is no longer there. Use `/blob/<sha>/path` for a file and add `#L10-L25` to
point at the specific lines under discussion.

Read the source comments before writing the explanation. Repositories worth
linking to tend to explain their own reasoning, including the approaches that
were discarded, and that reasoning is usually better than a summary written
from the diff alone.

## Before pushing

`make check` is required before every push. It runs the Prettier check, the em
dash and en dash lint, the post date-path lint, the Astro and content type
check, a production build, and validation of the build output. Do not push,
open a pull request, or ask for review until it passes.

```sh
make check
```

Run `make test` for the Playwright smoke and accessibility suite when the
change touches markup, routing, or navigation. Run `make help` to see every
target.
