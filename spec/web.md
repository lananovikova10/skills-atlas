# Web view
`./skill-atlas serve [--port <port>]` opens a local page over the same scan as `scan`:
a GitHub URL (also `…/tree/<commit or branch>`) or a local directory; `GITHUB_TOKEN` as in the CLI.
*Nothing is stored*.
- Listens on **127.0.0.1** only, port **4173** by default; prints `Skill Atlas at http://127.0.0.1:<port>/`
- A port in use → `Port <port> is in use; try --port <another>`, exit code 1; a bad port → the usage, exit code 1
- Serves only its own page files and Cytoscape; anything else → 404
## API
`GET /api/scan?repo=<GitHub URL | directory>` → JSON: `repository`, `warnings`, `ignored` as in the CLI, and `skills`
sorted by name, each with:
- `name`, `description` (full), `path` (canonical), `copies`, `link`
- `properties`: the other front matter keys, as parsed; `body`: the Markdown after the front matter
- `files`: the canonical file, then its copies, each with `path`, `agent`, `link`
- `roots`, `agents`: the skill roots it is in and their agents, canonical first
- `invocation`, `tools`: see below; `warnings`: the warnings about its files

No `repo` or an `AtlasError` (unreachable repository, unknown commit, …) → 400 `{ "error": <the CLI's message> }`.
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
  - **List**: a card per skill: name, the description's first sentence, agents, type, warnings
  - **Graph** (Cytoscape): the repository → its agents → their skills, colored by canonical agent;
    switches add the **allowed tools** and **front matter keys** as nodes shared by skills
- Clicking a skill (card or node) opens its sheet: the full description, every front matter key,
  its files with agent and link, its warnings, its content (Markdown; HTML is shown as text)
## Filters
- **Search**: every word in the name or description, case-insensitive
- Chips: **Agent**, **Type**, **Allowed tools**, **Front matter** (key present), **Other**:
  *In several agents*, *Has warnings*, *No description*
- OR within a group, AND across groups; each chip counts the skills it would show
- The repository, the view and the filters are in the URL hash: a reload or a shared link shows the same
