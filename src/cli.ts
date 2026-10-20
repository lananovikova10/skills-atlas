#!/usr/bin/env node
// The Node client: a GitHub repository or organization through the GitHub API, or a local
// directory; stdout and stderr, or the local web view. Nothing is stored.
import { run } from './commands.ts';
import { openGitHub, parseGitHubUrl } from './core/github.ts';
import { scanOwner } from './core/organization.ts';
import { openDirectory } from './local.ts';
import { startServer } from './serve.ts';

const token = process.env.GITHUB_TOKEN || undefined;
const open = (input: string) => (parseGitHubUrl(input) ? openGitHub(input, { fetch, token }) : openDirectory(input));

// The progress is one line on stderr, rewritten in place, and only in a terminal: nothing in a log.
let progressShown = false;
const clearProgress = () => {
  if (progressShown) process.stderr.write('\r\x1b[2K');
  progressShown = false;
};

process.exitCode = await run(process.argv.slice(2), {
  open,
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
  // The server keeps the process running until it is stopped.
  serve: async (port) => (await startServer({ open, port })).url,
  progress: process.stderr.isTTY
    ? (text) => {
        process.stderr.write(`\r\x1b[2K${text}`);
        progressShown = true;
      }
    : undefined,
});
clearProgress();
