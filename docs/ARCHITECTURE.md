# Architecture

LocalWeave separates workflow authority, model inference, deterministic tools, and replicated storage so each can evolve independently.

## Runtime flow

1. The dispatcher creates a task from a configured job stage.
2. Every peer observes the task through the replicated Autobee view.
3. The authoritative owner selects an available manifest advertising every required skill.
4. The selected peer persists `running`, asks its inference adapter for one allowed tool call, validates it, and invokes the TypeScript handler.
5. The peer persists the result and execution history through its own writer.
6. The owner observes that replicated change and either creates the next stage or publishes the final response.

## Boundaries

### Configuration

`LocalWeaveConfig` parses `localweave.yaml` with Zod. IDs and names must be unique, exactly one enabled dispatcher creates the network, job owners must exist, stage dependencies must be ordered, and at least one configured specialist must satisfy every stage.

### Inference

`AgentRuntime` is the adapter contract used by `TaskExecutor`. `QvacInferenceAdapter` owns QVAC model loading, completion calls, local knowledge initialization, and shutdown. `runtime-factory.ts` is the explicit adapter registry.

### Tools

Models select tools; they do not implement them. A tool has a name, description, Zod parameter schema, and deterministic handler. The harness rejects missing, multiple, unknown, disallowed, or malformed calls before executing a handler.

### State

Each peer has its own Corestore and Autobee writer. Autobee materializes operations into a Hyperbee2 view and replicates writer history over Hyperswarm connections. The task owner controls assignment and workflow progression, while specialists independently record execution transitions and results.

### Local control plane

The CLI writes commands and responses beneath `.localweave/`. This keeps the v0.1 interface small and makes restart recovery easy to inspect. It also means the packaged demo expects multiple processes on one machine. A network invitation or signed command protocol is the natural next step for cross-device operation.

## Deliberate limitations

- Sequential stages only; this is not a general DAG scheduler.
- One authoritative dispatcher per configured network.
- No automatic reassignment of ambiguous `running` work.
- No authentication or trust policy beyond the private discovery key.
- QVAC is the only included inference adapter.
- The example tools, prompts, and typed result fields are maintenance-oriented; task envelopes allow adapter-specific fields.
