#!/usr/bin/env node
// The Node client: a GitHub repository through the GitHub API, or a local directory; stdout and
// stderr, or the local web view. Nothing is stored.
import { run } from './commands.ts';
import { openGitHub, parseGitHubUrl } from './core/github.ts';
import { openDirectory } from './local.ts';
import { startServer } from './serve.ts';

const token = process.env.GITHUB_TOKEN || undefined;
const open = (input: string) => (parseGitHubUrl(input) ? openGitHub(input, { fetch, token }) : openDirectory(input));

process.exitCode = await run(process.argv.slice(2), {
  open,
  print: (text) => console.log(text),
  error: (text) => console.error(text),
  // The server keeps the process running until it is stopped.
  serve: async (port) => (await startServer({ open, port })).url,
});
