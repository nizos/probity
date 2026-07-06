# Probity

[![npm version](https://badge.fury.io/js/@nizos%2Fprobity.svg)](https://www.npmjs.com/package/@nizos/probity)
[![npm downloads](https://img.shields.io/npm/dt/@nizos/probity)](https://www.npmjs.com/package/@nizos/probity)
[![CI](https://github.com/nizos/probity/actions/workflows/ci.yml/badge.svg)](https://github.com/nizos/probity/actions/workflows/ci.yml)
[![Security](https://github.com/nizos/probity/actions/workflows/security.yml/badge.svg)](https://github.com/nizos/probity/actions/workflows/security.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Probity forces AI coding agents to follow your rules. It hooks into your agent and checks every file write and shell command before it happens. When an action breaks a rule, Probity blocks it and tells the agent why.

You can use it to enforce Test-Driven Development with the built-in rule, block destructive commands, or keep unwanted patterns out of your code. Writing your own rules takes a few lines of TypeScript, and one config works across most coding agents.

<p align="center">
  <img src="docs/assets/probity-tdd-demo.gif" alt="Probity enforcing TDD in a live agent session" width="1200">
</p>

## How it works

When a rule is broken, the agent sees a reason and a path forward:

```
Probity: you're adding production code before a failing test has been
observed.

The next TDD-legal step is to add one focused test in src/cart.test.ts
and run it to a clean assertion failure before implementing only the
minimum code to pass it.
```

The agent corrects course and continues.

Rules can be deterministic, matching commands or file content by string or regex, or AI-validated using official SDKs. Both kinds can read recent session activity, so actions are judged in context.

## Quick start

```bash
npm install -D @nizos/probity
```

Create `probity.config.ts` at your project root:

```ts
import { defineConfig, enforceTdd } from '@nizos/probity'

export default defineConfig({
  rules: [
    {
      files: ['src/**', 'test/**'],
      rules: [enforceTdd()],
    },
  ],
})
```

Then [wire it into your agent](docs/setup.md). One-time setup per agent.

## Built-in rules

- [`enforceTdd()`](docs/rules.md#enforcetdd): failing test first, minimal implementation, refactor on green
- [`forbidCommandPattern()`](docs/rules.md#forbidcommandpattern): block shell commands by pattern
- [`requireCommand()`](docs/rules.md#requirecommand): require a prior command (e.g. tests before commit)
- [`forbidContentPattern()`](docs/rules.md#forbidcontentpattern): block writes containing a pattern
- [`enforceFilenameCasing()`](docs/rules.md#enforcefilenamecasing): enforce a filename casing style

## FAQ

**Does it work with my agent?**
Probity currently works with Claude Code, Codex, and GitHub Copilot CLI, with more coming.

**Does it work with my language?**
Probity reads each agent's session transcript directly, so there are no per-framework reporters to install. It works with any language and test runner that your agent can work with.

**Does Probity need its own API key or subscription?**
No. AI-validated rules use each vendor's official SDK and reuse whatever authentication your agent already has, so Probity doesn't require its own access or billing.

**I'm already using TDD Guard. Should I switch?**
Yes. Probity handles refactors and multi-step edits more reliably, is safe with parallel sessions, and supports more agents. See [Migrating from TDD Guard](docs/migrating-from-tdd-guard.md).

## Documentation

- [Setup](docs/setup.md): wire Probity into your agent
- [Configuration](docs/configuration.md): config file shape, path scoping, and custom rules
- [Rules](docs/rules.md): built-in rules and their options
- [Migrating from TDD Guard](docs/migrating-from-tdd-guard.md): steps and customization mapping

## Contributing

Contributions are welcome. See the [contributing guidelines](CONTRIBUTING.md) to get started.

## License

[MIT](LICENSE)
