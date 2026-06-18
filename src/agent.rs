//! Shared vocabulary for agent loop implementations.
//!
//! This trait is the only Rust in the repo. Real code lives in `snippets/` as
//! verbatim copies from upstream projects — see `AGENTS.md` for the catalog.
//!
//! ```text
//! impl Agent for PiLoop        → snippets/pi/agent-loop.*.ts
//! impl Agent for PiStateful    → snippets/pi/agent.*.ts
//! impl Agent for OmpSession    → snippets/oh-my-pi/agent-session.*.ts
//! impl Agent for OmpSubagent   → snippets/oh-my-pi/task.*.ts
//! impl Agent for HermesAIAgent → snippets/hermes/*.py
//! impl Agent for AiToolLoopAgent → snippets/ai/*.ts
//! impl Agent for EveHarness        → snippets/eve/*.ts
//! impl Agent for OpenClawEmbedded  → snippets/openclaw/*.ts
//! impl Agent for CrushSessionAgent → snippets/crush/*.go
//! impl Agent for ClaudeCodeQuery   → snippets/claude-code/*.ts
//! ```

use std::future::Future;
use std::pin::Pin;

#[derive(Clone, Debug)]
pub enum Role {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Clone, Debug)]
pub struct Message {
    pub role: Role,
    pub content: String,
}

#[derive(Clone, Debug)]
pub enum AgentEvent {
    TurnStart,
    MessageDelta { text: String },
    ToolStart { name: String },
    ToolEnd { name: String, is_error: bool },
    TurnEnd,
    AgentEnd,
}

pub struct TurnResult {
    pub messages: Vec<Message>,
    pub events: Vec<AgentEvent>,
}

pub struct AgentConfig {
    pub max_iterations: u32,
    pub system_prompt: String,
}

/// The contract every snippet collection implements under a different shape.
pub trait Agent {
    fn run_turn(
        &mut self,
        input: Vec<Message>,
        config: &AgentConfig,
    ) -> Pin<Box<dyn Future<Output = TurnResult> + '_>>;

    fn continue_turn(
        &mut self,
        config: &AgentConfig,
    ) -> Pin<Box<dyn Future<Output = TurnResult> + '_>>;

    fn steer(&mut self, message: Message);

    fn on_event(&mut self, listener: Box<dyn Fn(AgentEvent) + Send>);

    fn budget_remaining(&self) -> Option<u32>;
}

// Marker impls document which snippet folder corresponds to which design.
// They do not wrap or compile against the copied TypeScript/Python.

pub struct PiLoop;
pub struct PiStateful;
pub struct OmpSession;
pub struct OmpSubagent;
pub struct HermesAIAgent;
pub struct AiToolLoopAgent;
pub struct EveHarness;
pub struct OpenClawEmbedded;
pub struct CrushSessionAgent;
pub struct ClaudeCodeQuery;

impl Agent for PiLoop {
    fn run_turn(&mut self, _: Vec<Message>, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/pi/agent-loop.entrypoints.ts — agentLoop()")
    }
    fn continue_turn(&mut self, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/pi/agent-loop.entrypoints.ts — agentLoopContinue()")
    }
    fn steer(&mut self, _: Message) {
        unimplemented!("see snippets/pi/agent.steer-followup.ts")
    }
    fn on_event(&mut self, _: Box<dyn Fn(AgentEvent) + Send>) {
        unimplemented!("see snippets/pi/agent.prompt-and-runloop.ts — subscribe / #emit")
    }
    fn budget_remaining(&self) -> Option<u32> {
        None
    }
}

impl Agent for PiStateful {
    fn run_turn(&mut self, _: Vec<Message>, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/pi/agent.prompt-and-runloop.ts — prompt() → #runLoop()")
    }
    fn continue_turn(&mut self, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/pi/agent.prompt-and-runloop.ts — continue()")
    }
    fn steer(&mut self, _: Message) {
        unimplemented!("see snippets/pi/agent.steer-followup.ts — steer()")
    }
    fn on_event(&mut self, _: Box<dyn Fn(AgentEvent) + Send>) {
        unimplemented!("see snippets/pi/agent.prompt-and-runloop.ts — subscribe()")
    }
    fn budget_remaining(&self) -> Option<u32> {
        None
    }
}

impl Agent for OmpSession {
    fn run_turn(&mut self, _: Vec<Message>, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/oh-my-pi/agent-session.prompt.ts — prompt()")
    }
    fn continue_turn(&mut self, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("delegates to inner Agent — snippets/pi/agent.prompt-and-runloop.ts")
    }
    fn steer(&mut self, _: Message) {
        unimplemented!("see snippets/oh-my-pi/agent-session.prompt.ts — #queueUserMessage steer")
    }
    fn on_event(&mut self, _: Box<dyn Fn(AgentEvent) + Send>) {
        unimplemented!("AgentSession wires agent.subscribe + persistence + extensions")
    }
    fn budget_remaining(&self) -> Option<u32> {
        None
    }
}

impl Agent for OmpSubagent {
    fn run_turn(&mut self, _: Vec<Message>, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/oh-my-pi/task.executor.run-subprocess.ts")
    }
    fn continue_turn(&mut self, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/oh-my-pi/task.executor.drive-session-to-yield.ts")
    }
    fn steer(&mut self, _: Message) {
        unimplemented!("see snippets/oh-my-pi/task.executor.drive-session-to-yield.ts — buildBudgetNotice steer")
    }
    fn on_event(&mut self, _: Box<dyn Fn(AgentEvent) + Send>) {
        unimplemented!("SubagentRunMonitor forwards AgentSession events")
    }
    fn budget_remaining(&self) -> Option<u32> {
        unimplemented!("see snippets/oh-my-pi/task.executor.drive-session-to-yield.ts — SOFT_REQUEST_BUDGET")
    }
}

impl Agent for HermesAIAgent {
    fn run_turn(&mut self, _: Vec<Message>, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/hermes/conversation_loop.run_conversation.py — run_conversation()")
    }
    fn continue_turn(&mut self, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("run_conversation(..., conversation_history=...)")
    }
    fn steer(&mut self, _: Message) {
        unimplemented!("_interrupt_requested — snippets/hermes/conversation_loop.run_conversation.py")
    }
    fn on_event(&mut self, _: Box<dyn Fn(AgentEvent) + Send>) {
        unimplemented!("callbacks on AIAgent — snippets/hermes/run_agent.AIAgent.py __init__ params")
    }
    fn budget_remaining(&self) -> Option<u32> {
        unimplemented!("see snippets/hermes/iteration_budget.py")
    }
}

impl Agent for AiToolLoopAgent {
    fn run_turn(&mut self, _: Vec<Message>, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/ai/tool-loop-agent.ts — generate() / stream()")
    }
    fn continue_turn(&mut self, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/ai/generate-text.tool-loop.ts — inner do-while after tool results")
    }
    fn steer(&mut self, _: Message) {
        unimplemented!("abortSignal on AgentCallParameters")
    }
    fn on_event(&mut self, _: Box<dyn Fn(AgentEvent) + Send>) {
        unimplemented!("onStepStart / onToolExecutionStart / onStepEnd callbacks")
    }
    fn budget_remaining(&self) -> Option<u32> {
        unimplemented!("see snippets/ai/stop-condition.ts — stopWhen default isStepCount(20)")
    }
}

impl Agent for EveHarness {
    fn run_turn(&mut self, _: Vec<Message>, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/eve/harness.create-tool-loop.ts — runStep(session, input)")
    }
    fn continue_turn(&mut self, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/eve/harness.handle-step-result.ts — { next: runStep }")
    }
    fn steer(&mut self, _: Message) {
        unimplemented!("park until StepInput / channel onDeliver")
    }
    fn on_event(&mut self, _: Box<dyn Fn(AgentEvent) + Send>) {
        unimplemented!("see snippets/eve/harness.tool-loop-agent-call.ts — emitStreamContent")
    }
    fn budget_remaining(&self) -> Option<u32> {
        Some(1) // one ToolLoopAgent step per workflow step
    }
}

impl Agent for OpenClawEmbedded {
    fn run_turn(&mut self, _: Vec<Message>, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/openclaw/run-embedded.prompt-active-session.ts — activeSession.prompt()")
    }
    fn continue_turn(&mut self, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/openclaw/run-embedded.start.ts — runEmbeddedAttempt compaction/retry")
    }
    fn steer(&mut self, _: Message) {
        unimplemented!("inbound queue + session write lock (not copied yet)")
    }
    fn on_event(&mut self, _: Box<dyn Fn(AgentEvent) + Send>) {
        unimplemented!("see snippets/openclaw/subscribe.embedded-session.ts — subscribeEmbeddedAgentSession")
    }
    fn budget_remaining(&self) -> Option<u32> {
        unimplemented!("see snippets/openclaw/memory.flush-gate.ts — shouldRunMemoryFlush")
    }
}

impl Agent for CrushSessionAgent {
    fn run_turn(&mut self, _: Vec<Message>, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/crush/coordinator.run.go — coordinator.Run → sessionAgent.Run")
    }
    fn continue_turn(&mut self, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/crush/agent.prepare-step-queue-drain.go — PrepareStep queue fold")
    }
    fn steer(&mut self, _: Message) {
        unimplemented!("see snippets/crush/agent.message-queue.go — enqueueCall while IsSessionBusy")
    }
    fn on_event(&mut self, _: Box<dyn Fn(AgentEvent) + Send>) {
        unimplemented!("see snippets/crush/agent.run-entry.go — publishRunComplete / message broker")
    }
    fn budget_remaining(&self) -> Option<u32> {
        unimplemented!("fantasy streaming step limits — see snippets/crush/coordinator.run.go")
    }
}

impl Agent for ClaudeCodeQuery {
    fn run_turn(&mut self, _: Vec<Message>, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/claude-code/query.entrypoints.ts — query() → queryLoop")
    }
    fn continue_turn(&mut self, _: &AgentConfig) -> Pin<Box<dyn Future<Output = TurnResult> + '_>> {
        unimplemented!("see snippets/claude-code/query.loop-continue.ts — next while(true) iteration")
    }
    fn steer(&mut self, _: Message) {
        unimplemented!("messageQueueManager + createUserInterruptionMessage — src/query.ts")
    }
    fn on_event(&mut self, _: Box<dyn Fn(AgentEvent) + Send>) {
        unimplemented!("see snippets/claude-code/query.entrypoints.ts — AsyncGenerator yields")
    }
    fn budget_remaining(&self) -> Option<u32> {
        unimplemented!("see snippets/claude-code/query.loop-continue.ts — maxTurns")
    }
}
