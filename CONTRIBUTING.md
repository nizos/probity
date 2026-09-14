# Contributing

Thank you for your interest in contributing to Probity. Contributions of all kinds are welcome and appreciated, whether it's fixing a bug, improving documentation, or proposing a new feature.

These guidelines exist to help your contributions land smoothly and increase the chances of your work being merged quickly.

## Before You Start

If you'd like to add a rule, add a vendor adapter, change existing behavior, or make a significant refactor, please open an issue first so we can discuss the approach together. This helps us align on direction early and avoids situations where you invest significant effort on something that may not fit the project's current priorities.

Bug fixes and small improvements are welcome as direct pull requests, though opening an issue first is still appreciated so we can track the change.

## Pull Requests

Each pull request should address a single concern. A PR that fixes a bug should not also refactor unrelated code or update formatting elsewhere. If you find additional changes worth making along the way, please open separate PRs for those.

Use meaningful titles that describe what the change accomplishes. The description should explain what the PR introduces and why.

### Core Requirements

Implementation must be test driven. Run `npm run checks` (lint, format, typecheck, tests, build).

### Canary Releases

Successful builds from `main` are published to npm under the `canary` dist-tag. Install the latest unreleased build with:

```bash
npm install -D @nizos/probity@canary
```

Canary builds are prereleases intended for testing and development. Stable releases remain available through the default `latest` dist-tag.

The canary workflow uses npm trusted publishing with GitHub Actions. The package maintainer must configure the `nizos/probity` repository and `.github/workflows/canary.yml` as a trusted publisher in the npm package settings before enabling publication.

### Commit Messages

Use conventional commits and communicate the why, not just what. Focus on the reasoning behind changes rather than describing what was changed. Commits should be atomic and pair tests with the implementation they verify.

## Style Guidelines

No emojis in code or documentation. Avoid generic or boilerplate content. Be deliberate and intentional. Keep it clean and concise.
