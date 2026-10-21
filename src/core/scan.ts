import { findSkills, SKILL_ROOTS, type Ignored, type SkillFile } from './find.ts';
import { newest, sortSkills, type LastUpdated, type Repository, type Skill } from './model.ts';
import { parseSkill } from './parse.ts';

/** A repository to scan: its files, and how to read them. */
export type Source = {
  repository: Repository;
  /** Every file path, relative to the repository root. */
  paths: string[];
  /** What listing the files had to leave out. */
  warnings: string[];
  /** The file's bytes, or undefined if it is not there. */
  read(path: string): Promise<Uint8Array | undefined>;
  /**
   * The most recent commit, up to the scanned commit, that changed the directory; undefined if none did.
   * Rejects when it cannot tell. Without it, the dates are not looked up: an organization scan.
   */
  lastUpdated?(directory: string): Promise<LastUpdated | undefined>;
};

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[]; ignored: Ignored[] };

/** fetch → find → parse → one skill per name. Nothing is stored: the result is all there is. */
export async function scan(source: Source): Promise<ScanResult> {
  const { files, ignored } = findSkills(source.paths);
  // The files are read at the same time: on GitHub, each one is a request.
  const results = await Promise.all(files.map((file) => readSkill(source, file)));
  const warnings = [...source.warnings, ...results.flatMap((result) => result.warnings)];

  // One skill per name, case-insensitive. The files are in root order, so the first is canonical.
  const groups = new Map<string, Skill[]>();
  for (const { skill } of results) {
    if (!skill) continue;
    const key = skill.name.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), skill]);
  }
  const skills: Skill[] = [];
  for (const group of groups.values()) {
    const [canonical, ...copies] = group;
    const own = group.flatMap((skill) => skill.warnings);
    const differing = copies.filter((copy) => copy.description !== canonical.description);
    if (differing.length > 0) {
      const warning = `${canonical.path}: description differs in ${differing.map((copy) => copy.path).join(', ')}`;
      warnings.push(warning);
      own.push(warning);
    }
    skills.push({
      ...canonical,
      copies: copies.map((copy) => copy.path),
      roots: [...new Set(group.flatMap((skill) => skill.roots))],
      warnings: own,
      // Across every location of the skill: the latest one.
      lastUpdated: newest(group.map((skill) => skill.lastUpdated)),
    });
  }
  return { repository: source.repository, skills: sortSkills(skills), warnings, ignored };
}

async function readSkill(source: Source, file: SkillFile): Promise<{ skill?: Skill; warnings: string[] }> {
  // The date is asked at the same time as the file: on GitHub, each is a request.
  const [bytes, updated] = await Promise.all([source.read(file.path), lastUpdated(source, file.path)]);
  if (!bytes) return { warnings: [`${file.path}: listed, but not found at the scanned commit; skipped`] };
  const parsed = parseSkill(new TextDecoder().decode(bytes));
  const warnings = parsed.warning ? [`${file.path}: ${parsed.warning}`] : [];
  if (updated.warning) warnings.push(updated.warning);
  // Names are compared as identities are: case-insensitively.
  if (parsed.name && parsed.name.toLowerCase() !== file.directory.toLowerCase()) {
    warnings.push(`${file.path}: name "${parsed.name}" differs from its directory "${file.directory}"; using "${parsed.name}"`);
  }
  const skill: Skill = {
    id: `${source.repository.id}:${file.path}`,
    repository: source.repository.id,
    path: file.path,
    name: parsed.name ?? file.directory,
    description: parsed.description,
    commit: source.repository.commit,
    copies: [],
    roots: [SKILL_ROOTS[file.rootIndex]],
    properties: parsed.properties,
    body: parsed.body,
    warnings,
    lastUpdated: updated.update ?? null,
  };
  return { skill, warnings };
}

/** The file's directory's last update. Not known → a warning, and the scan goes on. */
async function lastUpdated(source: Source, path: string): Promise<{ update?: LastUpdated; warning?: string }> {
  if (!source.lastUpdated) return {};
  try {
    const update = await source.lastUpdated(path.slice(0, path.lastIndexOf('/')));
    return update ? { update } : { warning: `${path}: last updated unknown: no commit changed its directory` };
  } catch (error) {
    return { warning: `${path}: last updated unknown: ${error instanceof Error ? error.message : String(error)}` };
  }
}
