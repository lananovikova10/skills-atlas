/** A skill file: its SKILL.md, the directory it is in, and which root it is under. */
export type SkillFile = { path: string; directory: string; rootIndex: number };

/** A SKILL.md-like file that is not a project skill, and why. */
export type Ignored = { path: string; reason: string };

/** Where agents keep a repository's own skills, at the repository root only, in canonical order. */
export const SKILL_ROOTS = ['.claude/skills', '.agents/skills', '.github/skills', 'agent/skills'];

/**
 * Exactly `<root>/<dir>/SKILL.md` is a skill file. Every other file named skill.md in
 * any case is ignored, with a reason. Only paths: nothing is read here.
 */
export function findSkills(paths: string[]): { files: SkillFile[]; ignored: Ignored[] } {
  const files: SkillFile[] = [];
  const ignored: Ignored[] = [];
  for (const path of paths) {
    const segments = path.split('/');
    const basename = segments.at(-1) ?? '';
    if (basename.toLowerCase() !== 'skill.md') continue;
    if (basename !== 'SKILL.md') {
      ignored.push({ path, reason: 'not named SKILL.md' });
      continue;
    }
    const rootIndex = SKILL_ROOTS.findIndex((root) => path.startsWith(`${root}/`));
    if (rootIndex < 0) {
      ignored.push({ path, reason: 'outside the skill roots' });
      continue;
    }
    const root = SKILL_ROOTS[rootIndex];
    const rest = path.slice(root.length + 1).split('/');
    if (rest.length === 2) files.push({ path, directory: rest[0], rootIndex });
    else if (rest.length > 2) ignored.push({ path, reason: `nested too deep in ${root}` });
    else ignored.push({ path, reason: `directly in ${root}, not in a skill directory` });
  }
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  files.sort((a, b) => a.rootIndex - b.rootIndex || compare(a.path, b.path));
  ignored.sort((a, b) => compare(a.path, b.path));
  return { files, ignored };
}
