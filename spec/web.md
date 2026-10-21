# Web view
`./skill-atlas serve [--port <port>]` opens a local page over the same scan as `scan`:
a GitHub URL (also `…/tree/<commit or branch>`) or a local directory; the page's own [GitHub token](#github-token),
else `GITHUB_TOKEN` as in the CLI.
*Nothing is stored*.
- Listens on **127.0.0.1** only, port **4173** by default; prints `Skill Atlas at http://127.0.0.1:<port>/`
- A port in use → `Port <port> is in use; try --port <another>`, exit code 1; a bad port → the usage, exit code 1
- Serves only its own page files and Cytoscape; anything else → 404
## API
`GET /api/scan?repo=<GitHub URL | directory>`, with `Authorization: Bearer <token>` when the page has a token,
→ JSON: `repository`, `warnings`, `ignored` as in the CLI, and `skills` sorted by name, each with:
- `name`, `description` (full), `path` (canonical), `copies`, `link`
- `properties`: the other front matter keys, as parsed; `body`: the Markdown after the front matter
- `files`: the canonical file, then its copies, each with `path`, `agent`, `link`
- `roots`, `agents`: the skill roots it is in and their agents, canonical first
- `invocation`, `tools`: see below; `warnings`: the warnings about its files

No `repo` or an `AtlasError` (unreachable repository, unknown commit, …) → 400 `{ "error": <the CLI's message> }`.
## Standalone page
`npm run build:standalone [-- <directory>]` writes the same page as **one HTML file**, `dist/` by default:
`skill-atlas-standalone.html`, and the same file as `index.html` for GitHub Pages.
- The styles, the scripts and Cytoscape are inline: no other file is loaded, and it opens from the disk
- The page asks `/api/scan` as above; the page itself answers it, from live GitHub, with the page's token if any:
  then its files come through the contents API, since raw.githubusercontent.com refuses a token from a page
- Listed from the **tree**, even with a token: GitHub answers code search with a token without
  `Access-Control-Allow-Origin`, so a page cannot read it; a tree too large for one answer → the CLI's warning, no hint
- A GitHub URL only: anything else → 400 `This standalone page scans GitHub repositories only: <input>`;
  no `repo` → 400 `Usage: /api/scan?repo=<GitHub URL>`; an `AtlasError` → 400 with its message
- Every push to `main` runs the tests, builds it and publishes it on GitHub Pages (`.github/workflows/pages.yml`)
## GitHub token
Without a token GitHub allows 60 API requests an hour per IP address; a user brings their own token:
- A **GitHub token** field next to **Repository**, optional, `type="password"`, with a hint: what it is for,
  that it is used only to ask GitHub, and that it is not kept
- **Analyse** sends it as `Authorization: Bearer <token>`; an empty field sends no header
- *Nothing is stored*: not in the URL hash, so not in a shared link; not in storage; a reload forgets it
- With a token, as in the CLI: GitHub's higher rate limit (5,000 requests an hour), private repositories, and with
  `serve` code search over the default branch (the standalone page lists the tree)
- `serve`: the page's token wins over `GITHUB_TOKEN`; an empty field → `GITHUB_TOKEN`, if set
- Messages name the page's token, unless `serve` used `GITHUB_TOKEN`:
  - No token, the rate limit → `GitHub rate limit reached (resets at <time> UTC); add a GitHub token`
  - A token GitHub rejects (401) → `GitHub rejected the GitHub token`
  - A tree too large for one answer → the CLI's warning, with `(a GitHub token searches everywhere)` from `serve`
## Agents
| Root | Agent |
|---|---|
| `.claude/skills` | Claude Code |
| `.agents/skills` | Codex / AGENTS.md |
| `.github/skills` | GitHub Copilot |
| `agent/skills` | Custom agent |
## Skill type
From the front matter, by who can invoke the skill:
- `disable-model-invocation: true` → **User only (slash command)**
- else `user-invocable: false` → **Model only**
- else → **Model & user**
- and also **Tool-restricted** when `allowed-tools` is set: a YAML list, or a string, comma-separated,
  else space-separated; spaces inside parentheses belong to the tool (`Bash(git diff:*)`)
## The page
- A **Repository** field and **Analyse**; the summary: `owner/repo`, `N skills`, the short commit,
  `N warnings · N ignored` (they open the stderr lines of the CLI)
- Two views, switched in the top bar, both filtered the same way:
  - **List**: a card per skill, grouped by agent, see [List](#list)
  - **Graph** (Cytoscape): the repository → its agents → their skills, colored by canonical agent;
    switches add the **allowed tools** and **front matter keys** as nodes shared by skills
- Clicking a skill (card or node) opens its sheet: the full description, every front matter key,
  its files with agent and link, its warnings, its content (Markdown; HTML is shown as text)
## List
- Grouped by **agent**: a group per set of agents the skills are in, so each skill is in one group. The agents
  in root order ([Agents](#agents)), and the groups in that order too, a set before the longer ones it starts:
  *Claude Code*, *Claude Code + Codex / AGENTS.md*, *Codex / AGENTS.md*, …; in a group, the skills by name
- A group's title: each agent's logo and name, joined by `+`, and how many skills it shows; a group with none
  is not shown
- A card: name, the description's first sentence, agents, type, warnings
- Each agent has a **logo**, in its color: Claude Code and GitHub Copilot their own marks (simple-icons);
  Codex / AGENTS.md a terminal; any other agent a robot. On the group titles, the cards, the **Agent** chips and
  the sheet's files
- A card's **accent**, a bar on its left: the color of its canonical agent, as in the graph
- Hover or keyboard focus: the card rises, and its border and background take its accent
- The search's words are **highlighted** in the card's name and description, as the card shows them: every
  place each word is, case-insensitively; the text keeps its case
## Filters
- **Search**: live, over the scan already shown: no submit, no re-scan
- Chips: **Agent**, **Type**, **Allowed tools**, **Front matter** (key present), **Other**:
  *In several agents*, *Has warnings*, *No description*
- OR within a group, AND across groups; each chip counts the skills it would show
- The repository, the view and the filters are in the URL hash: a reload or a shared link shows the same
## Search
- Over the skill's **name** and **description**; not its content or path. Case-insensitive substring;
  the whitespace around the query is ignored
- Several words: **every word** must match, in any order, in either field (`flag test` matches
  *feature-flags*, "…feature flag tests fail…"); an empty query shows every skill
- The list and the graph follow **every keystroke**, without Enter: under 100 ms for 500 skills, no debounce
- AND with the chips; the chip counts are among the skills that match the search; a chip with 0 stays, disabled
- While there is a query, the summary reads `Showing N of M skills`; it is `aria-live="polite"`
- Nothing matches: *No skills match "<query>"* and **Clear search**, which keeps the chips;
  chips alone that match nothing (from a link): *No skills match these filters.*
- Cleared by the **✕** in the field, by `Esc` in the field, and with the chips by **Clear filters**
- `q=` in the URL hash, next to `repo=`; analysing another repository keeps it
- **List**: the matches are highlighted, see [List](#list)
- **Graph**: the skills that do not match are hidden, as with the chips
- `/` focuses the field, unless focus is already in a text field
