# Probity Development Container

A consistent dev environment for working on Probity.

## What's Inside

- Node.js 24 on Debian bookworm
- CLIs: Claude Code, Codex, GitHub Copilot, Gemini, and GitHub
- VS Code extensions: Claude Code
- Persistent volume for `~/.claude` so credentials and history survive rebuilds

## Quick Start

1. Install [Docker](https://www.docker.com/products/docker-desktop/) and the VS Code [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers).
2. Open this repo in VS Code and run **Dev Containers: Reopen in Container**.
3. Inside the container: `npm install && npm run checks`.

## Troubleshooting

### `native binary not found at .../claude-agent-sdk-linux-arm64-musl/claude`

On arm64 Linux (e.g. the devcontainer running on Apple Silicon), the Claude Agent SDK's runtime resolver can pick the musl variant on a glibc system, even though the binary cannot execute. Tracked upstream as [anthropics/claude-agent-sdk-typescript#306](https://github.com/anthropics/claude-agent-sdk-typescript/issues/306).

Until it's fixed, clear both locations and retry:

```bash
rm -rf ~/.npm/_npx node_modules/@anthropic-ai/claude-agent-sdk-linux-arm64-musl
```

`npm install` may reinstall the musl variant later, since it's an `optionalDependency`. Re-run the cleanup if the error returns.
