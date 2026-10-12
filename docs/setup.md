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

The plugin ships the `PreToolUse` hook with the matcher `Bash|Write|Edit|NotebookEdit`, which covers commands and file modifications.

### Manual install

If you'd rather wire the hook yourself, add a `PreToolUse` entry to `.claude/settings.json` (project) or `~/.claude/settings.json` (user-global):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit|NotebookEdit",
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

The matcher controls which tools fire the hook. `Bash|Write|Edit|NotebookEdit` covers commands and file modifications.

Further reading: [Claude Code's hooks documentation](https://code.claude.com/docs/en/hooks).

## OpenAI Codex

Codex hooks are enabled by default. Add a `PreToolUse` hook in `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "^(Bash|exec|apply_patch|Edit|Write)$",
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

Codex's matcher is a regex. `^(Bash|exec|apply_patch|Edit|Write)$` covers shell commands and file modifications: Codex may report shell calls as `Bash` or `exec` depending on the release, and sends file writes as `apply_patch`; `Edit`/`Write` remain for older releases.

On Windows, point `commandWindows` at `node` with the installed `bin.js` directly — the npm `probity.cmd` shim can fail to spawn under Codex, in which case the hook silently never runs:

```json
"commandWindows": "node C:\\Users\\<you>\\AppData\\Roaming\\npm\\node_modules\\@nizos\\probity\\dist\\bin.js --agent codex"
```

Further reading: [Codex's hooks documentation](https://developers.openai.com/codex/hooks).

## GitHub Copilot CLI

GitHub Copilot CLI reads hooks from `.github/hooks/probity.json` in your project root. The cloud agent also reads it from your repo's default branch.

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

## Devin CLI

Devin uses native tool names (`exec`, `write`, `edit`, `apply_patch`, and
`notebook_edit`). Selecting the Claude adapter is not sufficient. Use `--agent devin`.

Install a build containing this adapter: earlier npm releases reject `--agent devin`.
For a local checkout, build it and replace the hook commands below with
`node /path/to/probity/dist/bin.js --agent devin` on all three entries.

Create `.devin/hooks.v1.json` in the project root. The file contains the hooks
object directly, without an outer `hooks` key:

```json
{
  "UserPromptSubmit": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "npx @nizos/probity --agent devin",
          "timeout": 180
        }
      ]
    }
  ],
  "PreToolUse": [
    {
      "matcher": "^(exec|write|edit|apply_patch|notebook_edit)$",
      "hooks": [
        {
          "type": "command",
          "command": "npx @nizos/probity --agent devin",
          "timeout": 180
        }
      ]
    }
  ],
  "PostToolUse": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "npx @nizos/probity --agent devin",
          "timeout": 180
        }
      ]
    }
  ]
}
```

For a global install, append these entries under `hooks` in Devin's user config
(`~/.config/devin/config.json`, or `%APPDATA%/devin/config.json` on Windows).
Preserve other hooks. Use the local `probity` binary instead of `npx` when installed
globally. Use `--config /absolute/path/probity.config.ts` on all three entries if the
hook's working directory does not discover the intended config. Check `/hooks`.

PreToolUse evaluates proposed actions; the other two hooks record prompts and
completed tool results without evaluating authorization rules. The PreToolUse
matcher covers the native command/file tools supported by this adapter; MCP tools
are not interpreted as native writes or commands. Keep PostToolUse matching all
tools so background results and other context remain in history. Recording hooks
can use a shorter timeout (for example 15 seconds); the pre-action timeout must
allow the configured AI validator to finish. All three hooks are needed for
history-aware rules. The observed
payloads have no native transcript path, so the adapter writes
`.probity/devin/<session_id>.jsonl` under `DEVIN_PROJECT_DIR` (falling back to the
process working directory). Keep `.probity/` ignored by Git. These files contain
local prompts, source and command output: treat them as private transcripts and
remove old session files when no longer needed. Projects and sessions use separate
files; blocked attempts are not recorded as successful execution. Background
`get_output` results remain separate raw events for the AI validator.

Deterministic rules need no AI configuration. For `enforceTdd`, configure
[`Config.ai`](configuration.md) with an implementation of the `Agent` contract.
An explicitly selected Codex validator can review Devin's recorded history.
Without one, AI rules block with a configuration message. The adapter does not
launch Devin recursively, guess an SDK, or assume that Devin login grants access
to another provider. Allow responses are empty so normal user permission checks
remain in effect. Invalid payloads/configuration produce a blocking JSON response;
a host timeout can still prevent enforcement, so size the timeout for the chosen
validator and verify it on your installed version.

Validated on Windows with Devin CLI `3000.11.1` and bundled runtime `3000.10.48`
from Devin Desktop `3.10.48`. Bundled-runtime validation is separate from driving
the Desktop GUI. Cloud handoff is not covered by this local adapter.
See [Devin hooks](https://docs.devin.ai/cli/extensibility/hooks/overview).

## CLI

The `probity` bin is what each vendor's hook command invokes. You can also run it directly — for testing rule changes, scripting CI checks, or pointing at a config that lives outside the repo.

```bash
npx @nizos/probity --agent <vendor> < hook-payload.json
```

The bin reads a hook payload from stdin (capped at 10 MiB) and writes the vendor's response JSON to stdout.

### Options

- `--agent <vendor>` — Required. One of `claude-code`, `codex`, `github-copilot`, or `devin`.
- `--config <path>` — Override the auto-discovered config file. See [Configuration](configuration.md#overriding-the-file-location).
- `--debug <path>` — Log each invocation's payload and response to `<path>` as JSONL for debugging.
- `--version` — Print the package version.
- `--help` — Print usage and exit.

Tip: tail the latest `--debug` entry live with `watch -n 1 -c 'tail -n 1 <path> | jq -C'`.
