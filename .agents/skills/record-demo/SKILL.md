---
name: record-demo
description: Record short demo videos of a feature — a web page driven by Playwright, or a CLI run captured from a real terminal and replayed — and save them as small MP4s in docs/demo/. Use when asked to record, film or make a video, screencast or demo of a feature.
---

# Record a demo video

Produces one MP4 per feature in `docs/demo/`, from **real runs on real data**: no mock-ups.
Two kinds of feature, two techniques:

- **Web page**: Playwright drives the page and records it (`recordVideo`)
- **CLI**: the real run is captured from a pty with its timings, then replayed in xterm.js in
  Playwright and recorded. This needs no terminal recorder (vhs, asciinema) on the machine

Then both are converted with ffmpeg and checked frame by frame before they are committed.

## 1. Know what to show

- Read the feature's spec (`spec/`) and pick the steps that show **each behaviour** in it, in an order
  a viewer can follow: the basic case, a combination, an edge case (nothing matches, a warning), the reset
- Pick **real input** that shows them well: run the feature on a few candidates and keep one with
  enough data that every step changes what is on screen. A filter that leaves the list as it was is
  a wasted step: check the counts before scripting it
- A demo of 20–40 s per feature

## 2. Set up outside the project

Never add recording tools to the project's dependencies. Use a scratch directory:

```bash
mkdir -p /tmp/demo-rec && cd /tmp/demo-rec && npm init -y >/dev/null
npm i playwright @xterm/xterm          # match the version of the browsers already in ~/Library/Caches/ms-playwright, else `npx playwright install chromium`
cp <repo>/.agents/skills/record-demo/scripts/* .
which ffmpeg                           # needed for the conversion
export GITHUB_TOKEN=$(gh auth token)   # GitHub scans: without it the rate limit cuts the run short
```

The scripts import `playwright` and `@xterm/xterm`, so run them from `/tmp/demo-rec`.

## 3a. A web page

1. Start the app detached, on a **non-default port**, and note the PID:
   `nohup ./skill-atlas serve --port 4199 > /tmp/demo-rec/serve.log 2>&1 & echo $!`, as a shell call of its
   own: started in a subshell of a longer command, it dies with it. Ask the API once (`curl`) before
   recording: a cold first scan can outlast the scenario's wait
2. Copy `browser-scenario.mjs` and write the scenario between its markers:
   - Type with `pressSequentially(…, { delay })` so the typing is visible
   - Wait for **the result on the page** (`locator(…).waitFor()`), never for a fixed time, before a step
     that needs it; then `pause()` 1.5–3 s so the viewer can read it
   - Select by id, role or text (`locator('.chip', { hasText: 'Tool-restricted' })`), not by position
   - A control that the previous step disabled (a chip with 0) times the click out: check the counts
3. `node my-scenario.mjs http://127.0.0.1:4199/ out-web` prints the `.webm` path
4. Stop the app: `kill <PID>`

## 3b. A CLI

1. Capture the real run through a pty, so the CLI behaves as in a terminal (progress lines, colours):

   ```bash
   stty cols 150
   script -q /dev/null <command> < /dev/null | node /tmp/demo-rec/stamp.mjs > /tmp/demo-rec/run.json
   ```

   - **Not** `script -F /dev/stdout`: the output is written twice
   - Check the capture: the final lines are there once, the progress line is there
2. Replay and record it:

   ```bash
   node replay-terminal.mjs run.json "<command as typed>" out-cli 150 46 1500
   ```

   - Columns and rows such that the output does not wrap and the header stays on screen
   - Waits over `maxGapMs` are shortened: say so wherever the video is described

## 4. Check, then convert

Look at the video before keeping it: extract frames at the key moments and read them.

```bash
ffprobe -v error -show_entries format=duration -of csv=p=0 out-web/*.webm
ffmpeg -v error -y -ss 12 -i out-web/*.webm -frames:v 1 -vf scale=640:-1 frame-12.png
ffmpeg -v error -y -sseof -1 -i out-cli/*.webm -frames:v 1 -vf scale=900:-1 frame-end.png
```

Check: each step shows what it should, nothing is doubled or cut, no text wraps badly, the last
frame is the final state. Fix the scenario and record again until it is right.

Convert to H.264, which GitHub and every player plays, small and without sound:

```bash
mkdir -p docs/demo
ffmpeg -v error -y -i <file>.webm -c:v libx264 -pix_fmt yuv420p -crf 26 -preset slow \
  -movflags +faststart -an docs/demo/<feature>.mp4
```

A few hundred KB each; over 2 MB, shorten the scenario.

## 5. Describe and deliver

- `docs/demo/README.md`: one line per video: the command or page, the input, the steps shown, a link
  to the spec. For a replayed CLI run, say it is a real run replayed and that long waits are shortened
- Link `docs/demo/` from the project README
- Then the project's definition of done (AGENTS.md): tests pass, a PR, a green CI. In the PR say how
  the videos were recorded
