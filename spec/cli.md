# Command line
`./skill-atlas scan <GitHub URL | directory>`
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
```
- Sorted by **name**; the description's *first sentence*
- `also in <paths>` for copies, in root order; warnings go to *stderr*
- `ignored: <path>: <reason>` lines go to *stderr*, after the warnings, sorted by path
- Skill warnings:
  - `warning: <path>: name "<name>" differs from its directory "<dir>"; using "<name>"`
  - `warning: <canonical path>: description differs in <copy paths>`
