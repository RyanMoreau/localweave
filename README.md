# LocalWeave

**Local AI specialists coordinating through durable, peer-to-peer state.**

LocalWeave is a small TypeScript runtime for composing AI workflows that run on your own hardware—without a central task database.

```text
                  replicated state
             ┌────────────────────────┐
             │                        │
        Willow ──────▶ Maverick ──────▶ Oscar
       dispatch       local model      local knowledge
                      + tools           + cited answer
```

Peers discover one another, advertise their capabilities, and independently record work through Autobee. Models can select tools, but LocalWeave validates every call before deterministic TypeScript code runs.

## Try it

Requires Node.js 20.x on macOS or Linux. The first run downloads QVAC's `QWEN3_1_7B_INST_Q4` model; later runs use the local cache.

```bash
npm install
npm start
```

In another terminal:

```bash
npm run demo:three
```

Or ask the included maintenance help desk a question:

```bash
npm run ask -- "Pump 7 is vibrating, its bearing is hot, and lubricant pressure is low. What should the operator do?"
```

Want to see the peers separately? Run these in three terminals:

```bash
npm run specialist -- willow
npm run specialist -- maverick
npm run demo:two
```

## Why LocalWeave?

- **Local by default:** inference and private knowledge stay on your hardware.
- **Durable:** tasks, results, and execution history survive process restarts.
- **Constrained:** models choose from explicitly allowed, schema-validated tools.
- **Composable:** specialists and sequential jobs are assembled in YAML.

The included example lives in [`examples/maintenance-helpdesk/localweave.yaml`](examples/maintenance-helpdesk/localweave.yaml). QVAC provides local inference, Hyperswarm handles discovery, and Autobee materializes multiwriter state over the Hypercore stack.

## Explore

- [How the runtime works](docs/ARCHITECTURE.md)
- [Build a specialist](docs/BUILD_A_SPECIALIST.md)
- [Contributing](CONTRIBUTING.md)

```bash
npm run check
```

LocalWeave is an early reference implementation, not a general distributed scheduler. See the [deliberate limitations](docs/ARCHITECTURE.md#deliberate-limitations) before building on it.

[MIT](LICENSE)
