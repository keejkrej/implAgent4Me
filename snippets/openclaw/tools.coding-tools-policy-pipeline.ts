// Copied excerpt from openclaw
// Source: openclaw/src/agents/agent-tools.ts
// Lines: 584-628, 1153-1174
// impl Agent: see AGENTS.md — createOpenClawCodingTools policy pipeline entry

  const {
    agentId,
    globalPolicy,
    globalProviderPolicy,
    agentPolicy,
    agentProviderPolicy,
    profile,
    providerProfile,
    profileAlsoAllow,
    providerProfileAlsoAllow,
  } = resolveEffectiveToolPolicy({
    config: options?.config,
    sessionKey: options?.sessionKey,
    agentId: options?.agentId,
    modelProvider: options?.modelProvider,
    modelId: options?.modelId,
  });
  const sandboxToolPolicy = sandbox?.tools;
  const groupPolicy = resolveGroupToolPolicy({
    config: options?.config,
    sessionKey: options?.sessionKey,
    spawnedBy: options?.spawnedBy,
    messageProvider: options?.messageProvider,
    groupId: options?.groupId,
    groupChannel: options?.groupChannel,
    groupSpace: options?.groupSpace,
    accountId: options?.agentAccountId,
    senderId: options?.senderId,
    senderName: options?.senderName,
    senderUsername: options?.senderUsername,
    senderE164: options?.senderE164,
  });
  const senderPolicy = resolveSenderToolPolicy({
    config: options?.config,
    agentId,
    messageProvider: options?.messageProvider,
    senderId: options?.senderId,
    senderName: options?.senderName,
    senderUsername: options?.senderUsername,
    senderE164: options?.senderE164,
  });
  const profilePolicy = resolveToolProfilePolicy(profile);
  const providerProfilePolicy = resolveToolProfilePolicy(providerProfile);

  // ... assemble core + plugin tools ...

  const subagentFiltered = applyToolPolicyPipeline({
    tools: toolsForModelProvider,
    toolMeta: (tool) => getPluginToolMeta(tool),
    warn: logWarn,
    steps: [
      ...buildDefaultToolPolicyPipelineSteps({
        profilePolicy: profilePolicyWithAlsoAllow,
        profile,
        profileUnavailableCoreWarningAllowlist: profilePolicy?.allow,
        providerProfilePolicy: providerProfilePolicyWithAlsoAllow,
        providerProfile,
        providerProfileUnavailableCoreWarningAllowlist: providerProfilePolicy?.allow,
        globalPolicy: globalPolicyWithToolSearchControls,
        globalProviderPolicy: globalProviderPolicyWithToolSearchControls,
        agentPolicy: agentPolicyWithToolSearchControls,
        agentProviderPolicy: agentProviderPolicyWithToolSearchControls,
        groupPolicy: groupPolicyWithToolSearchControls,
        senderPolicy: senderPolicyWithToolSearchControls,
        agentId,
        unavailableCoreToolReason,
      }),
      // ... additional pipeline steps ...
    ],
  });
