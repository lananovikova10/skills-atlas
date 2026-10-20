// What the web view filters by, derived from where a skill is and what its front matter says.
// No Node APIs here: the facets are plain data.
import { skillLink, type Repository, type Skill } from './model.ts';
import type { ScanResult } from './scan.ts';

/** The agent each skill root is for. */
export const AGENTS: Record<string, string> = {
  '.claude/skills': 'Claude Code',
  '.agents/skills': 'Codex / AGENTS.md',
  '.github/skills': 'GitHub Copilot',
  'agent/skills': 'Custom agent',
};

/**
 * Who can invoke a skill, from its front matter:
 * `disable-model-invocation: true` → only the user, as a slash command;
 * `user-invocable: false` → only the model; otherwise both.
 */
export type Invocation = 'model and user' | 'user only' | 'model only';

export type SkillView = Skill & {
  link: string;
  /** The canonical file, then its copies: each with its agent and link. */
  files: { path: string; agent: string; link: string }[];
  agents: string[];
  invocation: Invocation;
  /** `allowed-tools`: the only tools the skill may use; empty when it is not restricted. */
  tools: string[];
};

export type ScanView = Omit<ScanResult, 'skills'> & { skills: SkillView[] };

export function describeScan(result: ScanResult): ScanView {
  return { ...result, skills: result.skills.map((skill) => describeSkill(result.repository, skill)) };
}

export function describeSkill(repository: Repository, skill: Skill): SkillView {
  return {
    ...skill,
    link: skillLink(repository, skill),
    files: [skill.path, ...skill.copies].map((path) => ({ path, agent: agentOf(path), link: skillLink(repository, { ...skill, path }) })),
    agents: skill.roots.map((root) => AGENTS[root] ?? root),
    invocation: invocation(skill.properties),
    tools: allowedTools(skill.properties['allowed-tools']),
  };
}

function agentOf(path: string): string {
  const root = Object.keys(AGENTS).find((candidate) => path.startsWith(`${candidate}/`));
  return root ? AGENTS[root] : 'other';
}

function invocation(properties: Record<string, unknown>): Invocation {
  if (isTrue(properties['disable-model-invocation'])) return 'user only';
  if (isFalse(properties['user-invocable'])) return 'model only';
  return 'model and user';
}

const isTrue = (value: unknown) => value === true || value === 'true';
const isFalse = (value: unknown) => value === false || value === 'false';

/**
 * A YAML list, or one string: comma-separated, else space-separated. Spaces inside
 * parentheses belong to the tool, as in `Bash(git add:*)`.
 */
export function allowedTools(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== 'string') return [];
  const separator = value.includes(',') ? ',' : ' ';
  const tools: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of value) {
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (char === separator || (separator === ' ' && /\s/.test(char)))) {
      tools.push(current);
      current = '';
    } else current += char;
  }
  tools.push(current);
  return tools.map((tool) => tool.trim()).filter(Boolean);
}
