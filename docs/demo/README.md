# Demos
- [search-filter.mp4](search-filter.mp4): `./skill-atlas serve` on JetBrains/intellij-community: the live search
  (several words, nothing matches, **Clear search**), the graph filtered the same way, a chip AND the search,
  **Clear filters** ([spec/web.md](../../spec/web.md)). The video of
  [tests/browser/search-filter.spec.ts](../../tests/browser/search-filter.spec.ts): intellij-community at
  589d822, replayed from a recording of GitHub's answers; `npm run test:browser` records it again
- [skill-list.mp4](skill-list.mp4): `./skill-atlas serve` on [./fixture](../../fixture): the list grouped by agents,
  each with its logo and count, each card's accent and hover, then the search highlighted in the cards
  (`commit`, with the **Claude Code** chip, then `review pull`) and **Clear filters**
  ([spec/web.md](../../spec/web.md#list)). Recorded with Playwright in the Playwright image
- [organization-scan.mp4](organization-scan.mp4): `./skill-atlas scan https://github.com/anthropics`: the progress
  line, then every repository's skills in one list ([spec/organization.md](../../spec/organization.md)).
  A real run replayed in a terminal; waits over 1.5 s are shortened
- [github-token.mp4](github-token.mp4): the standalone page on JetBrains/koog, in Chromium against live GitHub:
  without a token, a token GitHub rejects, the user's own token (hidden as typed), then a reload that forgets it;
  the captions are added for the video ([spec/web.md](../../spec/web.md#github-token))
- [standalone-token.mp4](standalone-token.mp4): the built standalone page on react/react, in Chromium against live
  GitHub, with the user's token (hidden as typed): listed from the tree, no code search, so no CORS error; 7 skills,
  then the graph ([spec/web.md](../../spec/web.md#standalone-page))
