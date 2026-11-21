# LocalWeave

**Building blocks for local-first, peer-to-peer AI workflows.**

LocalWeave is a small TypeScript runtime for composing AI specialists that run on your own hardware. Peers advertise capabilities, execute constrained tools, and coordinate through durable multiwriter state rather than a central task database.

The included reference example is a maintenance help desk:

- **Willow** owns a job and dispatches its stages.
- **Maverick** uses local QVAC inference to select a deterministic keyword tool.
- **Oscar** searches a private local manual and returns a cited answer.

QVAC is the first inference adapter. Hyperswarm provides discovery and connections; Autobee, Hyperbee2, Hypercore, and Corestore provide persistent replicated state.

> LocalWeave v0.1 is a local multi-process reference implementation, not a generic distributed scheduler. Running peers on separate machines requires an out-of-band bootstrap-key exchange, which is not packaged yet.

## Quick start

Requirements: Node.js 20.x, npm, macOS or Linux, and internet access for installation, discovery, and the initial model download. The example uses QVAC's `QWEN3_1_7B_INST_Q4` model and caches it after the first run.

```bash
npm install
npm start
```

In another terminal:

```bash
npm run demo:three
```

Ask a custom question:

```bash
npm run ask -- "Pump 7 is vibrating, its bearing is hot, and lubricant pressure is low. What should the operator do?"
```

### Run the peers independently

The smaller demo proves the workflow across two independent processes:

```bash
# Terminal 1
npm run specialist -- willow

# Terminal 2
npm run specialist -- maverick

# Terminal 3
npm run demo:two
```

For the complete three-peer workflow, also start Oscar and run `npm run demo:three`.

## Durable state

Each specialist owns a persistent writer under `.localweave/peers/<id>`. Completed work and execution history survive process restarts.

```bash
npm run results
npm run result -- <incident-id>
npm run result -- --evidence <incident-id>
npm run retry -- --peer willow --task <task-id>
```

A retry creates attempt `N+1`. Replay only reads persisted history and is not exposed as a separate command in v0.1. Completed attempts are not executed twice.

## Configuration

The reference workflow lives in [`examples/maintenance-helpdesk/localweave.yaml`](examples/maintenance-helpdesk/localweave.yaml). It declares:

- specialist identities, display names, runtimes, skills, and allowed tools;
- optional private knowledge sources;
- job ownership and sequential capability-driven stages.

Set `LOCALWEAVE_CONFIG` to load another configuration and `LOCALWEAVE_DATA_DIR` to move persistent state.

YAML composes capabilities; it does not grant arbitrary code execution. Tools and inference adapters remain explicit TypeScript implementations behind validated boundaries.

## Why the boundaries matter

- **Replication is not authority.** Every peer observes shared changes, but one job owner makes assignment and progression decisions.
- **The model does not get the final say.** Tool count, name, allowlist, handler, and Zod arguments are validated before invocation.
- **Failures are durable.** A failed stage is persisted and must be retried explicitly.
- **Crashes are conservative.** Running work is not automatically reassigned because the runtime cannot know whether a side effect occurred before the crash.
- **Inference is replaceable.** `AgentRuntime` is the stable boundary; `QvacInferenceAdapter` is the included implementation.

See [Architecture](docs/ARCHITECTURE.md) and [Build a specialist](docs/BUILD_A_SPECIALIST.md).

## Verification

```bash
npm run check
```

The suite uses scripted model completions to reproduce invalid calls deterministically. It covers tool-loop correction, Zod boundaries, routing, configuration safety, replication, and restart recovery. Live QVAC inference remains a manual integration check because it is nondeterministic and hardware-dependent.

## License

[MIT](LICENSE)
