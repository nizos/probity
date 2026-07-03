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
