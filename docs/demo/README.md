# Demos
- [red-agent.mp4](red-agent.mp4): a real scan of this checkout through a temporary path, filtered to show
  the new `red-agent` skill and its file link ([spec/analysis.md](../../spec/analysis.md#this-repositorys-red-agent-skill)).
- [search-filter.mp4](search-filter.mp4): `./skill-atlas serve` on JetBrains/intellij-community: the live search
  (several words, nothing matches, **Clear search**), the graph filtered the same way, a chip AND the search,
  **Clear filters**, then **Sort** by *Last updated* with the search; every card says when it was last updated
  ([spec/web.md](../../spec/web.md)). The video of
  [tests/browser/search-filter.spec.ts](../../tests/browser/search-filter.spec.ts): intellij-community at
  589d822, replayed from a recording of GitHub's answers, the page's clock fixed at 2026-10-20 12:00 UTC;
  `npm run test:browser` records it again
- [last-updated-cli.mp4](last-updated-cli.mp4): `./skill-atlas scan github.com/JetBrains/android/tree/6c1bcc4…`: each
  skill's `updated <date>` line, the last commit up to the pin that changed its directory
  ([spec/cli.md](../../spec/cli.md)). A real run replayed in a terminal
- [skill-list.mp4](skill-list.mp4): `./skill-atlas serve` on [./fixture](../../fixture): the list grouped by agents,
  each with its logo and count, each card's accent and hover, then the search highlighted in the cards
  (`commit`, with the **Claude Code** chip, then `review pull`) and **Clear filters**
  ([spec/web.md](../../spec/web.md#list)). Recorded with Playwright in the Playwright image
- [skill-map.mp4](skill-map.mp4): `./skill-atlas serve` on JetBrains/intellij-community: the **Map**, its model
  downloaded only then; 41 skills in 6 topics; a topic fades the others, the search AND the topic, on the map
  and in the list; a skill's **Similar skills**; **Clear filters** ([spec/web.md](../../spec/web.md#map)).
  The video of [tests/browser/map.spec.ts](../../tests/browser/map.spec.ts): intellij-community at 589d822,
  replayed from a recording of GitHub's answers, the model's rows for its skills from tests/model;
  `npm run test:browser` records it again
- [organization-scan.mp4](organization-scan.mp4): `./skill-atlas scan https://github.com/anthropics`: the progress
  line, then every repository's skills in one list ([spec/organization.md](../../spec/organization.md)).
  A real run replayed in a terminal; waits over 1.5 s are shortened
- [github-token.mp4](github-token.mp4): the standalone page on JetBrains/koog, in Chromium against live GitHub:
  without a token, a token GitHub rejects, the user's own token (hidden as typed), then a reload that forgets it;
  the captions are added for the video ([spec/web.md](../../spec/web.md#github-token))
- [standalone-token.mp4](standalone-token.mp4): the built standalone page on react/react, in Chromium against live
  GitHub, with the user's token (hidden as typed): listed from the tree, no code search, so no CORS error; 7 skills,
  then the graph ([spec/web.md](../../spec/web.md#standalone-page))
