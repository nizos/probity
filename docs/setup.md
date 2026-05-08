# Setup

Install probity as a dev dependency, then wire it into your agent's hook system. Each vendor's section below shows the config to add.

```
npm install -D @nizos/probity
```

For non-Node projects (C++, PHP, Python, etc.), install globally with `npm install -g @nizos/probity` instead.

## Claude Code

### Recommended: install via plugin

Two commands wire probity into Claude Code's hook system, no manual config edit:

```
/plugin marketplace add nizos/probity
/plugin install probity@probity
```

The plugin ships the `PreToolUse` hook with the matcher `Bash|Write|Edit`, which covers commands and file modifications.

### Manual install

If you'd rather wire the hook yourself, add a `PreToolUse` entry to `.claude/settings.json` (project) or `~/.claude/settings.json` (user-global):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npx @nizos/probity --agent claude-code"
          }
        ]
      }
    ]
  }
}
```

The matcher controls which tools fire the hook. `Bash|Write|Edit` covers commands and file modifications.

Further reading: [Claude Code's hooks documentation](https://code.claude.com/docs/en/hooks).

## OpenAI Codex

Codex hooks are gated behind a feature flag. Enable it in `~/.codex/config.toml`:

```toml
[features]
codex_hooks = true
```

Then add a `PreToolUse` hook in `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^(Bash|apply_patch|Edit|Write)$",
        "hooks": [
          {
            "type": "command",
            "command": "npx @nizos/probity --agent codex"
          }
        ]
      }
    ]
  }
}
```

Codex's matcher is a regex. `^(Bash|apply_patch|Edit|Write)$` covers shell commands and file modifications (Codex sends file writes as `apply_patch`; `Edit`/`Write` are matcher synonyms documented by Codex).

Further reading: [Codex's hooks documentation](https://developers.openai.com/codex/hooks).

## GitHub Copilot Chat

The Copilot Chat extension (VS Code) reads hooks from `.github/hooks/probity.json` in your project root — the same location the CLI uses. Create the file with:

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "bash": "npx @nizos/probity --agent github-copilot-chat",
        "powershell": "npx @nizos/probity --agent github-copilot-chat"
      }
    ]
  }
}
```
Note the use of `bash` and `powershell` in this example, select the shell option available for your environment.

Every tool call fires the hook; probity's rules pass through non-write actions. The Chat adapter accepts `run_in_terminal`, `create_file`, and `replace_string_in_file` payloads. 

## GitHub Copilot CLI

GitHub Copilot CLI reads hooks from the same `.github/hooks/probity.json` — the cloud agent also reads it from your repo's default branch. The shape is identical to Chat; only the `--agent` value changes:

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "bash": "npx @nizos/probity --agent github-copilot",
        "powershell": "npx @nizos/probity --agent github-copilot"
      }
    ]
  }
}
```
Note the use of `bash` and `powershell` in this example, select the shell option available for your environment.

Every tool call fires the hook; probity's rules pass through non-write actions. Probity accepts Copilot's `bash`, `create`, and `edit` tool payloads.

Further reading: [GitHub Copilot's hooks reference](https://docs.github.com/en/copilot/reference/hooks-configuration).

## CLI

The `probity` bin is what each vendor's hook command invokes. You can also run it directly — for testing rule changes, scripting CI checks, or pointing at a config that lives outside the repo.

```bash
npx @nizos/probity --agent <vendor> < hook-payload.json
```

The bin reads a hook payload from stdin (capped at 10 MiB) and writes the vendor's response JSON to stdout.

### Options

- `--agent <vendor>` — Required. One of `claude-code`, `codex`, `github-copilot`, or `github-copilot-chat`.
- `--config <path>` — Override the auto-discovered config file. See [Configuration](configuration.md#overriding-the-file-location).
- `--debug <path>` — Log each invocation's payload and response to `<path>` as JSONL for debugging.
- `--version` — Print the package version.
- `--help` — Print usage and exit.

Tip: tail the latest `--debug` entry live with `watch -n 1 -c 'tail -n 1 <path> | jq -C'`.
