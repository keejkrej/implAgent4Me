// Copied excerpt from openclaw
// Source: openclaw/src/skills/loading/session.ts
// Lines: 388-433
// impl Agent: see AGENTS.md — load skills from agent dir + project config

export function loadSkills(options: LoadSkillsOptions): LoadSkillsResult {
  const { cwd, agentDir, skillPaths, includeDefaults } = options;

  // Resolve agentDir - if not provided, use default from config
  const resolvedAgentDir = agentDir ?? getAgentDir();

  const skillMap = new Map<string, Skill>();
  const realPathSet = new Set<string>();
  const allDiagnostics: ResourceDiagnostic[] = [];
  const collisionDiagnostics: ResourceDiagnostic[] = [];

  function addSkills(result: LoadSkillsResult) {
    allDiagnostics.push(...result.diagnostics);
    for (const skill of result.skills) {
      // Resolve symlinks to detect duplicate files
      const realPath = canonicalizePath(skill.filePath);

      // Skip silently if we've already loaded this exact file (via symlink)
      if (realPathSet.has(realPath)) {
        continue;
      }

      const existing = skillMap.get(skill.name);
      if (existing) {
        collisionDiagnostics.push({
          type: "collision",
          message: `name "${skill.name}" collision`,
          path: skill.filePath,
          collision: {
            resourceType: "skill",
            name: skill.name,
            winnerPath: existing.filePath,
            loserPath: skill.filePath,
          },
        });
      } else {
        skillMap.set(skill.name, skill);
        realPathSet.add(realPath);
      }
    }
  }

  if (includeDefaults) {
    addSkills(loadSkillsFromDirInternal(join(resolvedAgentDir, "skills"), "user", true));
    addSkills(loadSkillsFromDirInternal(resolve(cwd, CONFIG_DIR_NAME, "skills"), "project", true));
  }
  // ... additional skillPaths ...
}
