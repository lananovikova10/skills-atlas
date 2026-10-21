# Command line
`./skill-atlas scan <GitHub URL | directory>`
`./skill-atlas scan https://github.com/<owner> [--include-archived] [--include-forks]`: every repository of an
organization or user, see [organization.md](organization.md); the flags only with an owner URL, else exit code 1
`./skill-atlas serve [--port <port>]`: the same scan in a local web view, see [web.md](web.md)
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
## A pinned commit
`github.com/<owner>/<repo>/tree/<commit or branch>` scans that commit instead of the default branch;
the links pin it.
- Listed from the commit's **tree**, even with `GITHUB_TOKEN`: code search sees only the default branch
- A tree too large for one answer → only the skill roots, with the warning, without the `GITHUB_TOKEN` hint
- Unknown commit or branch → `Commit or branch not found: <ref> in https://github.com/<owner>/<repo>`, exit code 1
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
  updated <YYYY-MM-DD>
```
- Sorted by **name**; the description's *first sentence*
- `updated <YYYY-MM-DD>`, last for each skill: its [last update](analysis.md#last-updated), the day in UTC;
  `updated —` when unknown. Not in an organization scan. Sorted by name still: no other order
- `also in <paths>` for copies, in root order; warnings go to *stderr*
- `ignored: <path>: <reason>` lines go to *stderr*, after the warnings, sorted by path
- Skill warnings:
  - `warning: <path>: name "<name>" differs from its directory "<dir>"; using "<name>"`
  - `warning: <canonical path>: description differs in <copy paths>`
  - `warning: <path>: last updated unknown: <reason>`
