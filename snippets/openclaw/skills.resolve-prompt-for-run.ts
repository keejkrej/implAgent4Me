// Copied excerpt from openclaw
// Source: openclaw/src/skills/loading/workspace.ts
// Lines: 1503-1525
// impl Agent: see AGENTS.md — resolve skills prompt from snapshot or live entries

export function resolveSkillsPromptForRun(params: {
  skillsSnapshot?: SkillSnapshot;
  entries?: SkillEntry[];
  config?: OpenClawConfig;
  workspaceDir: string;
  agentId?: string;
  eligibility?: SkillEligibilityContext;
}): string {
  const snapshotPrompt = params.skillsSnapshot?.prompt?.trim();
  if (snapshotPrompt) {
    return snapshotPrompt;
  }
  if (params.entries && params.entries.length > 0) {
    const prompt = buildWorkspaceSkillsPrompt(params.workspaceDir, {
      entries: params.entries,
      config: params.config,
      agentId: params.agentId,
      eligibility: params.eligibility,
    });
    return prompt.trim() ? prompt : "";
  }
  return "";
}
