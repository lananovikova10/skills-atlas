# Demos
- [search-filter.mp4](search-filter.mp4): `./skill-atlas serve` on JetBrains/intellij-community: the live search
  (several words, nothing matches, **Clear search**), the graph filtered the same way, a chip AND the search,
  **Clear filters** ([spec/web.md](../../spec/web.md)). The video of
  [tests/browser/search-filter.spec.ts](../../tests/browser/search-filter.spec.ts): intellij-community at
  589d822, replayed from a recording of GitHub's answers; `npm run test:browser` records it again
- [organization-scan.mp4](organization-scan.mp4): `./skill-atlas scan https://github.com/anthropics`: the progress
  line, then every repository's skills in one list ([spec/organization.md](../../spec/organization.md)).
  A real run replayed in a terminal; waits over 1.5 s are shortened
- [github-token.mp4](github-token.mp4): the standalone page on JetBrains/koog, in Chromium against live GitHub:
  without a token, a token GitHub rejects, the user's own token (hidden as typed), then a reload that forgets it;
  the captions are added for the video ([spec/web.md](../../spec/web.md#github-token))
