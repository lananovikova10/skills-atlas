#!/usr/bin/env node
// The Node client: a GitHub repository or organization through the GitHub API, or a local
// directory; stdout and stderr. Nothing is stored.
import { run } from './commands.ts';
import { openGitHub, parseGitHubUrl } from './core/github.ts';
import { scanOwner } from './core/organization.ts';
import { openDirectory } from './local.ts';

const token = process.env.GITHUB_TOKEN || undefined;

// The progress is one line on stderr, rewritten in place, and only in a terminal: nothing in a log.
let progressShown = false;
const clearProgress = () => {
  if (progressShown) process.stderr.write('\r\x1b[2K');
  progressShown = false;
};

process.exitCode = await run(process.argv.slice(2), {
  open: (input) => (parseGitHubUrl(input) ? openGitHub(input, { fetch, token }) : openDirectory(input)),
  // Ctrl+C stops an organization scan and prints what was scanned so far; a second one quits at once.
  async scanOwner(owner, options) {
    const cancel = new AbortController();
    const stop = () => {
      cancel.abort();
      process.once('SIGINT', () => process.exit(130));
    };
    process.once('SIGINT', stop);
    try {
      return await scanOwner(owner, { ...options, signal: cancel.signal, fetch, token });
    } finally {
      process.off('SIGINT', stop);
    }
  },
  print: (text) => (clearProgress(), console.log(text)),
  error: (text) => (clearProgress(), console.error(text)),
  progress: process.stderr.isTTY
    ? (text) => {
        process.stderr.write(`\r\x1b[2K${text}`);
        progressShown = true;
      }
    : undefined,
});
clearProgress();
