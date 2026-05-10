# Probity

[![npm version](https://badge.fury.io/js/@nizos%2Fprobity.svg)](https://www.npmjs.com/package/@nizos/probity)
[![npm downloads](https://img.shields.io/npm/dt/@nizos/probity)](https://www.npmjs.com/package/@nizos/probity)
[![CI](https://github.com/nizos/probity/actions/workflows/ci.yml/badge.svg)](https://github.com/nizos/probity/actions/workflows/ci.yml)
[![Security](https://github.com/nizos/probity/actions/workflows/security.yml/badge.svg)](https://github.com/nizos/probity/actions/workflows/security.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Probity blocks AI coding agents from breaking your rules — adding production code without a failing test, disabling lint rules instead of fixing the issue, reaching for `rm -rf` when something more targeted would do. It works through your agent's existing hook system.

Probity is the successor to [TDD Guard](https://github.com/nizos/tdd-guard) (~2k stars, ~180k downloads), now with one config across Claude Code, Codex, GitHub Copilot Chat, and GitHub Copilot CLI.

<p align="center">
  <img src="docs/assets/probity-tdd-demo.gif" alt="Probity blocking an over-implementation attempt" width="1200">
</p>

## How it works

Each agent action (file write, shell command) fires a hook. Probity evaluates the action and either lets it through or sends back a reason and a path forward:

```
probity: you're adding production code before a failing test has been
observed.

The next TDD-legal step is to add one focused test in src/cart.test.ts
and run it to a clean assertion failure before implementing only the
minimum code to pass it.
```

The agent receives the message and corrects course. Rules can be deterministic (string or regex match on commands or file content) or AI-validated. AI-validated rules reuse your agent's existing authentication, so Probity doesn't need its own API key.

## Quick start

```bash
npm install -D @nizos/probity
```

Create `probity.config.ts` at your project root:

```ts
import {
  defineConfig,
  enforceTdd,
  forbidCommandPattern,
  forbidContentPattern,
} from '@nizos/probity'

export default defineConfig({
  rules: [
    forbidCommandPattern({
      match: /rm\s+-rf/,
      reason: '`rm -rf` is too broad; remove specific paths instead.',
    }),
    {
      files: ['src/**', 'test/**'],
      rules: [
        enforceTdd(),
        forbidContentPattern({
          match: 'eslint-disable',
          reason: 'Fix the lint violation rather than disabling the rule.',
        }),
      ],
    },
  ],
})
```

Then [wire it into your agent](docs/setup.md). One-time setup per agent.

## Built-in rules

- **`enforceTdd()`**: enforces the TDD cycle — failing test first, minimal implementation, refactor on green. Reads recent session activity, so refactors and multi-step edits don't trip false positives.
- **`forbidCommandPattern()`**: blocks shell commands by string or regex match. For destructive commands or steering agents to the right tool.
- **`requireCommand()`**: gates a command on a prior one in session history (e.g., block commits unless tests have run since the last edit).
- **`forbidContentPattern()`**: blocks file writes whose content matches a pattern (e.g., no `eslint-disable` or `setTimeout` in `src/`).
- **`enforceFilenameCasing()`**: blocks writes whose filename does not match a configured casing style.

Custom rules are a few lines of TypeScript. File scoping uses ESLint-style globs, including negations.

## FAQ

**Does it work with my agent?**
Probity currently works with Claude Code, Codex, GitHub Copilot Chat, and GitHub Copilot CLI, with more coming.

**Does it work with my language?**
Probity reads each agent's session transcript directly, so there are no per-framework reporters to install. It works with any language and test runner that your agent can work with.

**Does Probity need its own API key or subscription?**
No. AI-validated rules use each vendor's official SDK and reuse whatever authentication your agent already has, so Probity doesn't require its own access or billing.

**I'm already using TDD Guard. Should I switch?**
Probity's TDD validation reads the session transcript, which lets it handle refactors and multi-step edits more reliably. It also supports more agents and is safe with parallel sessions. The one gap: TDD Guard has a lint integration that Probity doesn't yet match.

## Documentation

- [Setup](docs/setup.md): wire Probity into your agent
- [Configuration](docs/configuration.md): config file shape, path scoping, and custom rules
- [Rules](docs/rules.md): built-in rules and their options

## Contributing

Contributions are welcome. See the [contributing guidelines](CONTRIBUTING.md) to get started.

## License

[MIT](LICENSE)
