# Migrating from TDD Guard

Probity validates against your agent's live session transcript, so it sees recent activity such as your prompts, test runs, and edits, and judges each change in that context. This means that no custom test reporters are needed.

## 1. Remove TDD Guard

Uninstall the plugin:

```
/plugin uninstall tdd-guard@tdd-guard
```

Then remove what TDD Guard needed:

- The [test reporter](https://github.com/nizos/tdd-guard/blob/main/docs/installation.md#3-add-test-reporter) from your test runner config and dependencies
- The CLI, if installed globally: `npm uninstall -g tdd-guard`
- The [data directory](https://github.com/nizos/tdd-guard/blob/main/docs/configuration.md#data-storage) and its `.gitignore` entry

If you configured TDD Guard manually, also remove:

- The [hook entries](https://github.com/nizos/tdd-guard/blob/main/docs/installation.md#2-configure-claude-code-hooks) from your [settings file](https://github.com/nizos/tdd-guard/blob/main/docs/configuration.md#settings-file-locations)
- The [environment variables](https://github.com/nizos/tdd-guard/blob/main/docs/configuration.md#environment-variables) from `.env`

## 2. Install Probity

```
npm install -D @nizos/probity
```

For non-Node projects (C++, PHP, Python, etc.), install globally with `npm install -g @nizos/probity` instead.

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

Then wire it into your agent:

```
/plugin marketplace add nizos/probity
/plugin install probity@probity
```

Restart your Claude session so the hook changes take effect. For other configurations, see [Setup](setup.md).

## 3. Port your customizations

This step applies if you customized TDD Guard's validation rules or ignore patterns.

### Custom TDD instructions

If you use [custom TDD instructions](https://github.com/nizos/tdd-guard/blob/main/docs/custom-instructions.md#custom-tdd-instructions), you can bring them with you using the `instructions` option on `enforceTdd()`. It takes a string or a function of the defaults.

Extend the defaults with a project-specific addendum:

```ts
enforceTdd({
  instructions: (defaults) => `${defaults}

### Project rule

Tests must use the project's custom assertion helpers.`,
})
```

Or replace the default rules outright:

```ts
enforceTdd({
  instructions: `Rules:
1. Tests must use the project's custom assertion helpers.
2. ...`,
})
```

For the full set of `enforceTdd` options, see [Rules](rules.md).

### Custom filters

`files` globs replace TDD Guard's [ignore patterns](https://github.com/nizos/tdd-guard/blob/main/docs/ignore-patterns.md#ignore-patterns-guide). Positive globs choose where a rule applies, and `!` negations carve out exceptions.

```ts
export default defineConfig({
  rules: [
    {
      files: [
        'src/**',
        'test/**',
        '!**/*.css',
        '!**/*.json',
        '!**/*.generated.ts',
      ],
      rules: [enforceTdd()],
    },
  ],
})
```

For glob anchoring and more scoping examples, see [Configuration](configuration.md).

## Verify

Use your agent as you normally would. When it reaches for production code without a failing test, Probity blocks the write and points it to the next TDD-legal step.
