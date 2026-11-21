# Build a specialist

LocalWeave separates composition from implementation. Reusing an existing capability is a YAML change; introducing a new capability requires a small, explicit TypeScript implementation.

## Reuse an existing capability

Add another specialist to `localweave.yaml` with a unique stable `id`, a display `name`, a registered `runtime`, and the skills and tools it can provide:

```yaml
agents:
  - id: second-analyst
    name: Second Analyst
    runtime: qvac
    role: specialist
    description: Another local report analyst
    skills: [extract-keywords]
    tools: [extract_keywords]
    model: QWEN3_1_7B_INST_Q4
    color: blue
    enabled: true
```

The owner will select an available capable specialist deterministically. No routing-code change is required.

## Compose a job

Jobs reference capabilities rather than specialist names:

```yaml
jobs:
  quick-triage:
    version: 1
    owner: willow
    stages:
      - id: triage
        type: extract-keywords
        requires: [extract-keywords]
        tool: extract_keywords
    demo: Inspect this maintenance report.
```

## Add a new tool-backed capability

1. Implement a deterministic tool handler under `src/ai/tools/`.
2. Define its input and output with Zod.
3. Add an agent class or execution branch that supplies the prompt and tool to `runToolLoop`.
4. Register the task type in the selected inference adapter.
5. Advertise the skill and allowed tool in YAML.
6. Add scripted completion tests for the valid call and malformed responses.

The model may choose the tool and generate its arguments, but the handler must still verify the task allowlist and parse arguments before performing work.

## Add an inference adapter

Implement `AgentRuntime` from `src/domain/contracts.ts`:

```ts
export interface AgentRuntime {
  initializeKnowledge(log: RuntimeLog): Promise<void>
  execute(task: Task, log?: RuntimeLog): Promise<NonNullable<Task['result']>>
  close(): Promise<Error[]>
}
```

Then register a factory in `src/ai/runtime-factory.ts` and reference its ID through `runtime:` in YAML. The peer, executor, storage, and workflow coordinator do not need to know which model framework is behind the adapter.
