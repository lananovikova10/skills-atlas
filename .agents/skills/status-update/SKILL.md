---
name: status-update
description: Post a status update to Slack listing the pull requests merged and issues resolved in this repository since a given date and time. Use on a schedule, or when asked for a status update, a changelog since a date, or what shipped recently.
---

# Status update to Slack

Collects what changed in this repository since a point in time and posts
it to the private Slack channel `C0CAR4MBCF5`, using the bot token in
`SLACK_BOT_TOKEN`.

Runs unattended. Never print the token, put it in a file, or pass it in a URL.

## 1. Decide the time window

- **Until** = now.
- **Since**, in this order:
  1. the date and time given in the request (any format; convert to ISO 8601
     with a timezone, default `Europe/Amsterdam`)
  2. otherwise, the `until` of the previous status update (step 6)
  3. otherwise, 24 hours ago

Show times to the reader in `Europe/Amsterdam`.

## 2. Collect merged PRs

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh pr list --repo "$REPO" --state merged --limit 200 \
  --search "merged:>=<since-ISO>" \
  --json number,title,url,author,mergedAt,labels,closingIssuesReferences
```

Drop any PR with `mergedAt` after **until**.

## 3. Collect resolved issues

```bash
gh issue list --repo "$REPO" --state closed --limit 200 \
  --search "closed:>=<since-ISO>" \
  --json number,title,url,closedAt,stateReason,labels
```

- **Resolved** = `stateReason: COMPLETED`.
- `NOT_PLANNED` (duplicates, won't fix) is only counted, not listed.
- For each resolved issue, note the merged PR that closed it, if any
  (from `closingIssuesReferences` in step 2).

## 4. Build the message

Slack mrkdwn. Escape `&`, `<` and `>` in titles as `&amp;`, `&lt;`, `&gt;`.
Links use `<url|text>`.

```
*🚀 Status update · skills-atlas*
<since> → <until> (Europe/Amsterdam)

*Merged PRs (3)*
• <url|#52 feat: live search filter> · @author
• <url|#55 fix: empty state on zero matches> · @author

*Resolved issues (4)*
• <url|#41 Bug: search crashes on "["> · P0 · fixed by #55
• <url|#38 Add filters for skills> · fixed by #52

_Also closed as not planned: 2_

*💡 Fascinating fact*
<one or two sentences, see below>
```

- Sort PRs by merge time and issues by close time, oldest first.
- Show the priority label (`P0`–`P3`) on issues when there is one.
- More than 20 items in a section → list the first 20 and add
  `…and N more: <GitHub search link|see all>`.
- Nothing merged or resolved → post the header, the line
  `No merged PRs or resolved issues since <since>.`, and the fact.

### The fascinating fact

End every update with one fact, one or two sentences. Pick the first that works:

1. **From this period's data**, when something stands out. Compute it from
   steps 2–3, don't estimate. Examples: the fastest issue → merged PR, the
   largest PR by lines changed (`gh pr view <n> --json additions,deletions`),
   the issue with the most review rounds, a new record compared to the
   previous update.
2. **From computing or software history**, otherwise. Something surprising
   and related to the work if possible: testing, search, code review,
   GitHub, the web, programming languages.

Rules:
- Only well-established facts you are certain of. If unsure about a
  number, date or name, pick a different fact rather than hedge or guess.
- One fact, no lists, no emoji beyond the heading.
- Never repeat a fact: compare with the `fact` stored in the previous
  updates' metadata (step 6) and choose another topic.

## 5. Post it

Write the payload to a file with `jq` (so quoting can't break), then post:

```bash
jq -n --arg text "$MESSAGE" --arg until "<until-ISO>" --arg fact "$FACT" '{
  channel: "C0CAR4MBCF5",
  text: $text,
  unfurl_links: false,
  metadata: { event_type: "status_update", event_payload: { until: $until, fact: $fact } }
}' > /tmp/slack.json

curl -sS -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data @/tmp/slack.json
```

Check the response: it must contain `"ok": true`. Otherwise stop and report
the `error`:

| Error | Meaning |
|-------|---------|
| `not_in_channel` / `channel_not_found` | The bot isn't a member of the private channel. Invite it there. |
| `missing_scope` | The bot token lacks `chat:write`. |
| `invalid_auth` / `not_authed` | `SLACK_BOT_TOKEN` is missing or wrong. |

Delete `/tmp/slack.json` afterwards.

## 6. Finding the previous update

To get **since** from the last run (step 1, option 2):

```bash
curl -sS -G https://slack.com/api/conversations.history \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  --data-urlencode "channel=C0CAR4MBCF5" \
  --data-urlencode "include_all_metadata=true" \
  --data-urlencode "limit=50"
```

Take the newest message with `metadata.event_type == "status_update"` and
use its `event_payload.until`. Collect `event_payload.fact` from all
status-update messages returned, to avoid repeating facts. This needs the `groups:history` scope; if the
call fails with `missing_scope`, fall back to 24 hours and mention it in
the run report.

## Guardrails

- Read-only on GitHub: never change issues, PRs or labels.
- Post only to channel `C0CAR4MBCF5`, once per run.
- Never log, echo or store `SLACK_BOT_TOKEN`.
- If GitHub or Slack fails, don't post a partial update; report the error.