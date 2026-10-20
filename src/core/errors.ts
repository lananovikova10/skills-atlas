/** A failure explained to the user: the CLI prints the message and exits with code 1. */
export class AtlasError extends Error {}

/** GitHub's request budget is spent; `reset` is when it comes back, if GitHub said. */
export class RateLimitError extends AtlasError {
  readonly reset?: Date;

  constructor(advice: string, reset?: Date) {
    super(`GitHub rate limit reached${reset ? ` (resets at ${formatReset(reset)})` : ''}; ${advice}`);
    this.reset = reset;
  }
}

/** `12:34:56 UTC`: the budget resets within the hour. */
export function formatReset(reset: Date): string {
  return `${reset.toISOString().slice(11, 19)} UTC`;
}

/** A repository without a single commit: there is nothing to scan. */
export class EmptyRepositoryError extends AtlasError {}
