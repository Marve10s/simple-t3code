# SimpleT3Code

SimpleT3Code is a personal fork of [T3 Code](https://github.com/pingdotgg/t3code), with a Codex-style UI and simplified logic. We regularly merge upstream `main`. Keep changes focused and upstream patches small so those merges remain manageable.

## Protect the app hosting your work

You may be running inside the installed SimpleT3Code app. Its desktop process, server, database, and Electron profile are live infrastructure for this session.

- Never stop, restart, replace, or modify the live state of the app hosting your work. If verification or installation requires quitting it, report that dependency and let the developer quit it.
- Start development servers only when explicitly requested. Track the PID, ports, working directory, and data directory of each process you start. Stop only your own processes when their step ends.
- Never kill by name or pattern with `pkill -f`, `pgrep | kill`, or a worktree-path match. Your agent and unrelated apps can match the same string. For a port collision, inspect the listener with `lsof -nP -iTCP:<port> -sTCP:LISTEN` on macOS or `ss -H -ltnp` on Linux, then choose a free port instead of killing an existing process.
- Never start a server against, open read-write, delete, or clean up `~/.simplet3/userdata` or `~/.t3/userdata`. Read-only snapshots are allowed. Two servers must never share a live event store.
- Set an explicit isolated data directory for verification. `T3CODE_HOME` changes database storage, but does not isolate the Electron profile. A normal built-app launch uses `~/Library/Application Support/simplet3code` on macOS, just like the installed app. Run it only while the installed app is closed, and restore any `simplet3code:` preferences you change.
- Never override `HOME` to isolate a launch. macOS needs the real home directory to find the login keychain.
- Unset `ELECTRON_RUN_AS_NODE` before launching Electron directly. Agent shells can inherit it; the repository's desktop launcher clears it automatically.
- Do not replace `/Applications/SimpleT3Code.app` while it is running.

## Keep upstream merges manageable

- Put fork additions in fork-owned files, especially `apps/web/src/components/codex/`, `apps/web/src/simple-codex.css`, `assets/simple/`, and `apps/web/public/backgrounds/`. The desktop history import lives in `apps/desktop/src/app/DesktopT3CodeHistoryImport.ts`.
- Prefer small hooks in upstream files, such as a data attribute, mount, or import swap. Make necessary logic changes directly, but avoid unrelated restructuring, reordering, or formatting.
- Restyle upstream components through unlayered `simple-codex.css`, using existing `data-slot` attributes or fork `data-codex-part` hooks. Use component variants and sizes instead of restyling UI primitives with `className`; keep layout on parents. Do not invent Tailwind class names for fork hooks.
- Store device-local fork preferences under `simplet3code:` local-storage keys instead of extending upstream settings contracts.
- Format only changed files with `vp fmt <files>`. The upstream merge helper performs its own formatting pass.
- Let upstream documentation and agent rules merge normally. Resolve conflicts by keeping fork-specific policies and behavior while incorporating useful new upstream guidance. Review cleanly merged rules for contradictions with this fork.

## Merging upstream

Run `pnpm merge-upstream`, or `pnpm merge-upstream <ref>`, from a clean working tree. It defaults to `upstream/main` when that remote exists, otherwise `origin/main`.

The helper fetches and merges without committing, keeps conflicting fork deletions and newly introduced test files out of the tree, strips comments, formats, and lists remaining conflicts. Documentation conflicts remain for manual resolution.

Resolve those conflicts, remove reintroduced test scripts, test configuration, and test-only dependencies, and run `pnpm install` if dependency manifests changed. Verify the merge before an authorized commit. Do not use `git stash`.

## Development

- `vp i` installs dependencies. The `t3.json` setup action installs them for new worktrees.
- `vp run dev` starts the server and web client. `vp run dev:desktop` starts desktop development.
- Linked worktrees default to their own `.t3/userdata`, even when an ambient `T3CODE_HOME` exists. An explicit `--home-dir` takes precedence. The main checkout's web/server development default is `~/.t3/dev/userdata`; use an explicit isolated directory when verifying changes.
- Read actual ports from the `[dev-runner]` output. Occupied ports can shift the defaults.
- Do not manually set `VITE_HTTP_URL` or `VITE_WS_URL` for web development. The dev runner manages origins, and Vite proxies backend routes so remote clients work.
- Never commit or publish authentication tokens or pairing URLs. Give a requested sharing URL to the developer without consuming it yourself.

Sharing, pairing, and reusable development credentials are covered in [the development runbook](docs/operations/development.md).

## Test data

Use realistic data when verifying history or state behavior. Snapshot `~/.simplet3/userdata/state.sqlite` through a read-only SQLite connection with `VACUUM INTO`. Use `~/.t3/userdata/state.sqlite` only when upstream history is needed.

- Create a fresh isolated destination containing `userdata/state.sqlite`; `VACUUM INTO` refuses to overwrite an existing file. Never delete an existing database to make room for a snapshot.
- Do not copy a live SQLite file with `cp`. Snapshotting captures a consistent database while the source remains open.
- Copy settings, attachments, or secrets only when the verification requires them. Never symlink live state into the sandbox or copy sandbox data back to the live app.
- Point `T3CODE_HOME` or `--home-dir` at the snapshot's parent directory, above `userdata`, and confirm the resolved path before launch.

## Verification

- Do not add automated tests, test-runner configuration, or test-only dependencies. Do not run upstream test-suite commands.
- For code changes, run the affected package's typecheck and scoped lint. For desktop, server, or web runtime changes, also run `vp run build:desktop`. For an upstream merge or before filing a code PR, run `pnpm typecheck`, `vp lint`, and `vp run build:desktop`.
- Documentation-only changes need link, formatting, and content checks, without a desktop build. Match verification to the changed behavior and report any limits.
- User-visible changes need a run in the built app when authorized and safely isolated. Browser or computer use requires an explicit request or agreement. Use `test-t3-app` for web/desktop verification and `test-t3-mobile` for native verification; follow their setup instructions rather than duplicating them here.
- If verification requires closing the app hosting this session, finish the independent checks and report the remaining step. Never close it yourself.

## Architecture and code locations

Clients send typed WebSocket requests. Server commands pass through a pure decider to persisted events; projectors derive the client read model. Provider adapters translate CLI protocols, queue-backed reactors handle side effects and emit receipts, and turns end with checkpoints for diff and restore. See the [technical glossary](docs/internals/glossary.md).

- `apps/server`: WebSocket, orchestration, provider adapters, and checkpoints. Read `.repos/effect-smol/LLMS.md` before writing Effect code.
- `apps/web`: React/Vite client. Fork components and styling live in the locations listed above.
- `apps/desktop`: Electron shell, IPC, app identity, and server lifecycle.
- `apps/mobile`: React Native client. `apps/marketing`: website.
- `packages/contracts`: wire schemas and small derived helpers, without heavy runtime logic.
- `packages/client-runtime`: client logic shared by web and mobile.
- `packages/shared`: runtime utilities with subpath exports, without a barrel.
- `.repos/`: read-only dependency references. Never edit or import from them. Run `pnpm sync:repos` when updating the matching dependency.

## Coding rules

- Follow nearby patterns and existing abstractions. Keep provider-specific complexity in adapters and orchestration pure.
- Prefer inferred TypeScript types. Never use `any`; narrow or decode `unknown` at untrusted boundaries.
- Do not add explanatory comments. Preserve only tool-required directives, triple-slash references, license blocks, JavaScript JSDoc types, and tool-read documentation tags. `pnpm strip-comments` reports removable comments; `pnpm strip-comments --write` removes them.
- Check affected entry points, clients, providers, and contract consumers. Preserve local and remote behavior, and provide reverse actions for reversible state changes.
- Avoid excessive WebSocket payloads, expensive list rendering, and animations that repaint while idle. Honor reduced motion and prefer transform/opacity animations.
- Use appropriately licensed assets and preserve required credits. Bundled backgrounds must be public-domain works or Unsplash-licensed photos.
- Preserve SimpleT3Code's app ID `com.marve10s.simplet3code`, URL scheme `simplet3code`, separate data/profile directories, and separation from upstream's update feed.
- First launch imports upstream history with `VACUUM INTO` only when the fork database does not exist. Keep that a one-way copy, never shared storage.

## Documentation

Update guidance when a change makes it inaccurate. Do not add feature inventories, code walkthroughs, or PR summaries to internal docs.

- `docs/user/`: tasks and unintuitive behavior in the shipped app, without implementation details.
- `docs/internals/`: architectural decisions, cross-component constraints, and traps the source does not explain.
- `docs/operations/`: maintainer setup, release, and debugging procedures.

Keep scratch files, research notes, and implementation plans outside the worktree and out of commits.

## Pull requests

- Commit, push, or open a PR only when authorized by the developer.
- Use a conventional title such as `fix(web): prevent stale thread labels`. Keep one concern per PR.
- Describe the problem, resulting behavior, and verification. End the body with the model and harness used.
- Include before/after images for UI changes or a short video for motion and timing. Upload evidence to GitHub instead of committing PR-only assets.
