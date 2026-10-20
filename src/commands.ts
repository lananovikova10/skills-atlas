// The skill-atlas commands. The same code serves the Node CLI and the browser
// terminal: everything that differs between them comes in through the context.
import { AtlasError } from './core/errors.ts';
import { parseOwnerUrl } from './core/github.ts';
import { skillLink, type Repository, type Skill } from './core/model.ts';
import type { OwnerScanOptions, OwnerScanResult } from './core/organization.ts';
import { scan, type Source } from './core/scan.ts';

export type Context = {
  /** Opens what the user asked to scan. */
  open(input: string): Promise<Source>;
  /** Scans every repository of a GitHub organization or user. */
  scanOwner(owner: string, options: OwnerScanOptions): Promise<OwnerScanResult>;
  print(text: string): void;
  /** Errors and warnings. */
  error(text: string): void;
  /** `Scanning 37 / 140 repositories…`, while an organization is scanned; the CLI shows it only in a terminal. */
  progress?(text: string): void;
  /** Starts the local web view; resolves to its URL. Only the Node CLI has it. */
  serve?(port: number): Promise<string>;
};

/** The exit code of a cancelled scan, as for Ctrl+C. */
export const CANCELLED = 130;

const usage = `Usage: skill-atlas <command>

  scan <GitHub URL | directory>   find every SKILL.md in a repository and print it
  scan https://github.com/<owner> [--include-archived] [--include-forks]
                                  the same for every repository of an organization or user
  serve [--port <port>]           open the web view on 127.0.0.1 (port 4173 by default)
  help                            show this help`;

/** Runs one command; returns its exit code. */
export async function run(args: string[], context: Context): Promise<number> {
  const [command = 'help', ...rest] = args;
  try {
    if (command === 'scan') return await scanCommand(rest, context);
    else if (command === 'serve') await serveCommand(rest, context);
    else if (command === 'help') context.print(usage);
    else throw new AtlasError(`Unknown command: ${command}\n\n${usage}`);
    return 0;
  } catch (error) {
    if (!(error instanceof AtlasError)) throw error;
    context.error(error.message);
    return 1;
  }
}

const FLAGS = ['--include-archived', '--include-forks'];

async function scanCommand(args: string[], context: Context): Promise<number> {
  const flags = args.filter((arg) => FLAGS.includes(arg));
  const inputs = args.filter((arg) => !FLAGS.includes(arg));
  if (inputs.length !== 1) throw new AtlasError('Usage: skill-atlas scan <GitHub URL | directory> [--include-archived] [--include-forks]');
  const owner = parseOwnerUrl(inputs[0]);
  if (owner) return scanOwnerCommand(owner, flags, context);
  if (flags.length > 0) throw new AtlasError(`${flags.join(', ')}: only for an organization or user URL, https://github.com/<owner>`);
  const result = await scan(await context.open(inputs[0]));
  printRepository(result.repository, result.skills, context);
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
  for (const item of result.ignored) context.error(`ignored: ${item.path}: ${item.reason}`);
  return 0;
}

/** Partial results (failed repositories, the cap, the rate limit) still exit 0; a cancelled scan exits 130. */
async function scanOwnerCommand(owner: string, flags: string[], context: Context): Promise<number> {
  const result = await context.scanOwner(owner, {
    includeArchived: flags.includes('--include-archived'),
    includeForks: flags.includes('--include-forks'),
    onNotice: context.error,
    onProgress: ({ done, total }) => context.progress?.(`Scanning ${done} / ${total} repositories…`),
  });
  const repositories = new Map(result.repositories.map((repository) => [repository.id, repository]));
  const { archived, forks, empty, overCap } = result.skipped;
  const skipped = archived.length + forks.length + empty.length + overCap.length;
  context.print(
    [
      result.owner.login,
      `${count(result.skills.length, 'skill')} in ${count(repositories.size, 'repository', 'repositories')}`,
      `${skipped} skipped`,
      count(result.warnings.length, 'warning'),
    ].join(' · '),
  );
  for (const skill of result.skills) {
    const repository = repositories.get(skill.repository)!;
    const name = `${skill.name} · ${repository.name}`;
    context.print(skill.description ? `${name} — ${firstSentence(skill.description)}` : name);
    printLinks(repository, skill, context);
  }
  for (const warning of result.warnings) context.error(`warning: ${warning}`);
  for (const item of result.ignored) context.error(`ignored: ${item.path}: ${item.reason}`);
  const reasons = [
    archived.length && `${archived.length} archived (--include-archived)`,
    forks.length && `${count(forks.length, 'fork')} (--include-forks)`,
    empty.length && `${empty.length} empty`,
    overCap.length && `${overCap.length} over the cap`,
  ].filter(Boolean);
  if (reasons.length > 0) context.error(`skipped: ${reasons.join(', ')}`);
  return result.cancelled ? CANCELLED : 0;
}

async function serveCommand(args: string[], context: Context) {
  if (!context.serve) throw new AtlasError('serve runs only from the command line');
  const usage = 'Usage: skill-atlas serve [--port <port>]';
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--port')) throw new AtlasError(usage);
  const port = args.length ? Number(args[1]) : 4173;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new AtlasError(usage);
  context.print(`Skill Atlas at ${await context.serve(port)}`);
}

/** `<owner>/<repo> · N skills`, then each skill's name, first sentence and link. */
function printRepository(repository: Repository, skills: Skill[], context: Context) {
  context.print(`${repository.id} · ${count(skills.length, 'skill')}`);
  for (const skill of skills) {
    context.print(skill.description ? `${skill.name} — ${firstSentence(skill.description)}` : skill.name);
    printLinks(repository, skill, context);
  }
}

function printLinks(repository: Repository, skill: Skill, { print }: Context) {
  print(`  ${skillLink(repository, skill)}`);
  if (skill.copies.length > 0) print(`  also in ${skill.copies.join(', ')}`);
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function firstSentence(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return /^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line;
}
