# Contributing

LocalWeave is intentionally small. Contributions should preserve the separation between replicated state, workflow authority, inference adapters, and deterministic tools.

## Development

Use Node.js 20.x, then install and verify:

```bash
npm install
npm run check
```

Before opening a change:

- add deterministic tests for model and tool-loop edge cases;
- keep example-specific behavior out of replicated storage and routing primitives;
- validate untrusted model, YAML, and replicated inputs with Zod;
- document any new adapter, tool, state transition, or recovery behavior;
- do not commit `.localweave/`, model files, private manuals, or credentials.

New workflows using existing capabilities should generally be examples or YAML changes. New capabilities should include a typed tool handler and scripted completion tests.
