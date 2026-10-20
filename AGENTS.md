# AGENTS.md
## Specs
Read [./spec](spec/) first. Update it with the code.
## Tests
Integration tests for every case in the spec.
## Definition of done
- All tests pass locally
- Open a PR when done
- A change a user can see (the CLI's output, the web page): a short demo video in the PR, recorded with
  [record-demo](.agents/skills/record-demo/SKILL.md); when one cannot be recorded, the PR says why
- The CI build must be green

## Commands
- `npm ci`: first, in a fresh checkout
- `npm test`: the tests
- `npm run test:browser`: the web view in Chromium (`npx playwright install chromium` once); a video of every run in `test-results/`
