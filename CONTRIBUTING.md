# Contributing

Thanks for helping out. SimpleT3Code is a small fork, so the bar is simple. Changes should improve the interface and keep upstream merges cheap.

> **Important**: Open an issue before starting a new feature or a large change. Bugs in agents, the server or sync belong upstream in [T3 Code](https://github.com/pingdotgg/t3code/issues).

<br>

## TL;DR

```bash
git clone https://github.com/Marve10s/simple-t3code.git
cd simple-t3code
vp i
vp run dev:desktop    # Electron app with hot reload
vp run dev            # Server and web app in a browser
```

<br>

## Project structure

```
├── apps/
│   ├── desktop/        # Electron shell, identity, T3 Code history import
│   ├── server/         # Agents, orchestration, checkpoints (upstream)
│   ├── web/            # React UI
│   │   └── src/
│   │       ├── components/codex/   # Everything SimpleT3Code adds to the UI
│   │       └── simple-codex.css    # Restyles upstream components
│   └── mobile/         # React Native app (upstream, unchanged)
├── packages/           # Contracts and shared runtime code (upstream)
├── assets/simple/      # SimpleT3Code icon
└── scripts/
    ├── merge-upstream.ts   # Merges T3 Code and cleans up the result
    └── strip-comments.ts   # Removes comments that arrive with a merge
```

Most of the fork lives in `apps/web/src/components/codex/`. Everything else is T3 Code with small hooks.

<br>

## Development

### Prerequisites

- [Node.js 24](https://nodejs.org/)
- [Vite+](https://viteplus.dev/guide/) for the `vp` command. Install it with `curl -fsSL https://vite.plus | bash` on macOS and Linux, or `irm https://vite.plus/ps1 | iex` in PowerShell on Windows.
- [Rust](https://rustup.rs), plus the platform build tools listed in the [README](./README.md#install), if you build installers

### Setup

```bash
vp i
```

### Running the app

```bash
vp run dev:desktop    # Electron app
vp run dev            # Server and web app; open the pairing URL it prints
```

The development server keeps its data in `~/.t3/dev/userdata`, or in `.t3/userdata` inside a git worktree. Never point it at `~/.t3/userdata` or `~/.simplet3`. Those are the live databases of the installed apps.

### Building an installer

```bash
vp run dist:desktop:dmg      # macOS
vp run dist:desktop:win      # Windows
vp run dist:desktop:linux    # Linux AppImage
```

Artifacts land in `release/`.

<br>

## Checks

SimpleT3Code has no automated test suite. Before you open a PR, run:

```bash
pnpm typecheck               # All packages
vp lint                      # Lint
vp fmt                       # Format
vp run build:desktop         # Desktop build
```

Then try the change in the built app. For anything visible, include before and after screenshots in the PR, or a short video if it moves.

<br>

## Keeping merges cheap

T3 Code changes every day and we merge it often. Every line we change in an upstream file is a line that can conflict.

- Put new code in fork-owned files, mostly `apps/web/src/components/codex/`.
- Touch upstream files only with small hooks: a data attribute, a one-line mount, a swapped import. Don't reformat or reorder upstream code.
- Restyle upstream components from `simple-codex.css` using their `data-slot` attributes or our own `data-codex-part` attributes.
- Store fork-only preferences in local storage under `simplet3code:` keys instead of changing upstream settings.
- Don't write comments or tests. The codebase has neither, and the merge script removes any that arrive.

[AGENTS.md](./AGENTS.md) has the full set of rules, which also apply to coding agents.

<br>

## Merging upstream

```bash
git remote add upstream https://github.com/pingdotgg/t3code.git   # once
pnpm merge-upstream
```

The script fetches T3 Code's `main` and merges it without committing. It then:

1. Keeps test files and anything else the fork deleted out of the tree.
2. Leaves documentation conflicts for manual resolution. Keep fork-specific policies and incorporate useful new upstream guidance.
3. Strips comments and formats the code.
4. Lists the conflicts left to resolve by hand.

After resolving those, remove any test scripts or test-only dependencies the merge brought back, run `vp i` if a `package.json` changed, and run the [checks](#checks) before committing.

<br>

## Making changes

1. **Open an issue.** Describe the bug or the feature.
2. **Fork and clone.**
3. **Branch.** `git checkout -b feat/your-feature` or `fix/your-bug`.
4. **Code.** Follow the rules in [Keeping merges cheap](#keeping-merges-cheap).
5. **Check.** Run the [checks](#checks) and try the change in the app.
6. **Commit.** Use conventional commits, as below.
7. **Push and open a PR.** Link the issue.

<br>

## Commit convention

```
feat: add a new feature
fix: fix a bug
docs: update documentation
chore: maintenance
refactor: change code without changing behavior
chore: merge upstream T3 Code
```

<br>

## Need help?

- Check the [existing issues](https://github.com/Marve10s/simple-t3code/issues).
- Open a [new issue](https://github.com/Marve10s/simple-t3code/issues/new) with your question.

<br>

---

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
