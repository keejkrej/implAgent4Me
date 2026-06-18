// Copied excerpt from openclaw
// Source: openclaw/src/agents/embedded-agent-runner/run/attempt.ts
// Lines: 1095-1137
// impl Agent: see AGENTS.md — skills injection before system prompt build

    const {
      skillsEligibility,
      skillsPromptWorkspaceDir: effectiveSkillsPromptWorkspace,
      skillsSnapshot: skillsSnapshotForRun,
      skillsWorkspaceDir: effectiveSkillsWorkspace,
      workspaceOnly: loadSkillsWorkspaceOnly,
    } = resolveSandboxSkillRuntimeInputs({
      sandbox,
      effectiveWorkspace,
      skillsSnapshot: params.skillsSnapshot,
    });
    const { shouldLoadSkillEntries, skillEntries } = resolveEmbeddedRunSkillEntries({
      workspaceDir: effectiveSkillsWorkspace,
      config: params.config,
      agentId: sessionAgentId,
      eligibility: skillsEligibility,
      skillsSnapshot: skillsSnapshotForRun,
      workspaceOnly: loadSkillsWorkspaceOnly,
    });
    restoreSkillEnv = skillsSnapshotForRun
      ? applySkillEnvOverridesFromSnapshot({
          snapshot: skillsSnapshotForRun,
          config: params.config,
        })
      : applySkillEnvOverrides({
          skills: skillEntries ?? [],
          config: params.config,
        });
    const promptSkillEntries = mapSandboxSkillEntriesForPrompt({
      entries: shouldLoadSkillEntries ? skillEntries : undefined,
      skillsWorkspaceDir: effectiveSkillsWorkspace,
      skillsPromptWorkspaceDir: effectiveSkillsPromptWorkspace,
    });

    const skillsPrompt = resolveSkillsPromptForRun({
      skillsSnapshot: skillsSnapshotForRun,
      entries: promptSkillEntries,
      config: params.config,
      workspaceDir: effectiveSkillsPromptWorkspace,
      agentId: sessionAgentId,
      eligibility: skillsEligibility,
    });
    prepStages.mark("skills");
