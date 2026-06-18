// Copied excerpt from oh-my-pi
// Source: oh-my-pi/packages/agent/src/agent.ts
// Lines: 762-776
// impl Agent: see AGENTS.md

	/**
	 * Queue a steering message to interrupt the agent mid-run.
	 * Delivered after current tool execution, skips remaining tools.
	 */
	steer(m: AgentMessage) {
		this.#steeringQueue.push(m);
	}

	/**
	 * Queue a follow-up message to be processed after the agent finishes.
	 * Delivered only when agent has no more tool calls or steering messages.
	 */
	followUp(m: AgentMessage) {
		this.#followUpQueue.push(m);
	}
