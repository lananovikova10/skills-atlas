---
name: red-agent
description: Hunt Skill Atlas web bugs with Playwright, confirm each twice, and file evidenced GitHub issues. Use when asked to hunt for bugs, break the web view, or run exploratory testing.
---

# Red agent — break the web view

Find real bugs in the web view and file them so another agent can fix them. Do not fix application code during a bug-hunting run.

Every ordinary bug issue carries **`Delegated to AI`**, which starts the `issue-to-pr` automation. A wrong or duplicate issue costs an implementation run. File only bugs confirmed twice by the same failing repro test.

## 1. Learn what correct means

- Read `README.md`, `AGENTS.md`, `docs/`, `spec/`, and the specs and acceptance criteria in open and closed issues (`gh issue list --state all --limit 100`). A bug differs from a spec or is a clear failure under [What counts as a bug](#4-what-counts-as-a-bug).
- Note the scanned commit SHA and app version being tested.
- Load existing bug issues to avoid duplicates:

  ```bash
  gh issue list --state all --label red-agent --limit 200 --json number,title,state,body
  ```

## 2. Start the app and harness

- Start the local web view as `README.md` describes. Test only the local view and mocked APIs.
- Use Playwright with `video: 'on'`, a fixed viewport, and listeners for `console` errors and `pageerror` on every page. The repository's Playwright configuration already supplies video and a fixed viewport; set explicit overrides when a charter needs a different viewport.
- Mock the served page's `/api/scan` response with `page.route()` for nearly every test. The local server calls GitHub itself, so routing `api.github.com` in the browser does not mock a served scan. Let the local server handle invalid or local-directory inputs when testing its validation. For the standalone page, route its browser requests to `api.github.com`. Keep runs deterministic, avoid rate limits, and feed the app hostile data. Hit the real GitHub API only to confirm a bug that depends on it, without attacking that service.
- When testing Map, mock its Hugging Face model file requests with `page.route()` and the `tests/model/` fixtures, as `tests/browser/map.spec.ts` does. Test download errors with mocked failures; do not make exploratory runs depend on the real model host.
- Give each charter its own recorded Playwright session. The existing test runner finds specs under `tests/browser/`.

## 3. Explore — charters

Work through these charters. Stop a charter after about 10 minutes without a new finding.

| Charter | Try |
|---------|-----|
| Repository input | Empty, spaces, `http://`, trailing `/`, `.git` suffix, owner-only URL, non-GitHub URL, 2,000 chars, unicode, `<img src=x onerror=alert(1)>` |
| API responses | 404, 403 rate limit, 500, timeout, slow (5 s), malformed JSON, empty repo, 0 skills, 500 skills |
| Skill data | Missing name or description, huge description, duplicate names across roots, unicode and emoji names, HTML/Markdown in description, malformed front matter |
| Search & facets | Regex characters (`.*[(`), only spaces, very long query, every facet combination including Topic after Map builds, clear filters mid-typing |
| Sorting | Every available sort with search and facets; unknown dates, if sorting is supported by the tested version |
| URL hash | Edit `#repo=`, `q=`, `view=map`, `topic=`, and any supported `sort=` by hand; invalid values; reload; back/forward |
| Map | Lazy model download, download failure then a new scan, 0 and 500 skills, topic chips with search, stable points under filters, Fit, similar-skill links |
| Interaction | Double-click Analyse, analyse while a scan runs, switch List/Graph/Map during a scan, keyboard only (Tab, `/`, Esc) |
| Layout | 375 px and 1920 px widths, 200% zoom, light and dark scheme, long names and Map labels wrapping |

## 4. What counts as a bug

File:

- Behaviour that contradicts the spec or an issue's acceptance criteria
- Uncaught exception or console error
- Wrong data: missing, duplicated or wrong skills, counts, links or dates
- UI stuck in loading, lost state, or an action that does nothing
- Broken layout: horizontal scroll, overlapping or cut-off text, unreachable controls
- Content injected as HTML (XSS)

Do not file feature requests, style preferences without functional impact, anything you cannot reproduce twice, or problems in GitHub or the harness.

## 5. Confirm each bug

For every candidate:

1. **Minimize** the steps that show it.
2. Write a repro at `tests/browser/red-agent/<slug>.spec.ts` asserting the *expected* behaviour, so it fails now and passes once fixed. Use mocked responses for deterministic cases.
3. Run that test twice in fresh browser contexts. Both runs must fail for the same reason. If it fails only sometimes, note it as flaky in the run summary and do not file it.
4. Keep a failing-run video and a screenshot of the broken state.

The same root cause in several places is one bug, listing every affected place.

## 6. Check for duplicates

Search before filing:

```bash
gh issue list --state all --search "<2-4 key words>" --json number,title,state
```

Compare the result with the `red-agent` issues from step 1. For an open match, add a comment with the new evidence instead of filing. For a closed match, file a regression issue and link the old one.

## 7. Publish the evidence

The GitHub API cannot attach files to issues. Commit videos and screenshots to the dedicated `red-agent-evidence` branch and link them. Use a separate worktree so switching to the evidence branch does not disturb repro tests or the current branch. Create an orphan branch when it does not exist; otherwise fetch and continue it. Never force-push or put repro tests on the evidence branch.

```bash
mkdir -p bugs/<slug>
cp <video>.webm <screenshot>.png bugs/<slug>/
git add bugs/<slug> && git commit -m "evidence: <slug>"
git push origin red-agent-evidence
```

Run these commands **inside the evidence worktree**. Link each file as `https://github.com/<owner>/<repo>/blob/red-agent-evidence/bugs/<slug>/<file>`.

## 8. File one issue per bug

Ensure the `red-agent` label exists (`gh label create red-agent` if missing). `Delegated to AI` must already exist; do not create it.

```bash
gh issue create \
  --title "Bug: <what breaks, in plain words>" \
  --label bug --label red-agent --label "Delegated to AI" \
  --body-file <file>
```

Use this body:

````markdown
## Summary
One sentence: what breaks and for whom.

## Steps to reproduce
1. Open the web view at `<url>`
2. …
3. …

## Expected
What should happen. Cite the spec or issue (#n) when there is one.

## Actual
What happens instead. Include console errors verbatim.

## Evidence
- Video: <link>
- Screenshot: <link>

## Repro test
Fails now, passes when fixed. Add it to `tests/browser/` as part of the fix.

```ts
<contents of tests/browser/red-agent/<slug>.spec.ts>
```

## Environment
App commit `<sha>` · Chromium <version> · viewport <w×h> · mocked API: yes/no

<!-- red-agent:<slug> -->
````

**Exceptions to the label:**

- Security bugs (XSS, token leaks): file with `bug`, `red-agent`, and `security` but **without** `Delegated to AI`, and leave out a working exploit payload. A human decides.
- Bugs needing a product decision (the spec is silent or contradictory): file with `bug` and `red-agent`, without `Delegated to AI`, and state what needs deciding.

## 9. Limits and guardrails

- File at most **5 issues** per run, highest severity first: data loss or wrong data, crashes, broken core flows, then layout. List remaining findings in the run summary.
- Do not change application code or open PRs during a bug-hunting run.
- Never commit to the default branch. Evidence goes to `red-agent-evidence`.
- Never file without a repro test that failed twice for the same reason.
- Never put tokens, cookies, or personal data in issues, videos, or screenshots.
- Test only the local web view and mocked APIs. Never attack GitHub or another real service.

## 10. Report

End with charters covered, issue links, duplicates commented on, flaky or unfiled findings, and charters not reached.
