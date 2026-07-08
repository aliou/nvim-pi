# nvim-pi

Public Pi extension bundled with a Neovim plugin. People could be using this through either Neovim plugin install, `pi install npm:@aliou/nvim-pi`, or `pi install git:github.com/aliou/nvim-pi`, so keep backwards compatibility in mind when making changes.

Pi is pre-1.0.0, so breaking changes can happen between Pi versions. This extension must stay up to date with Pi or things will break.

## Stack

- TypeScript (strict mode)
- Lua (Neovim plugin)
- pnpm 10.26.1
- Biome for linting/formatting
- Vitest for TypeScript tests
- shell.nix + .envrc for local dev environment
- Husky for pre-commit checks
- Changesets for version management

## Scripts

```bash
pnpm typecheck    # TypeScript type check
pnpm lint         # Lint
pnpm format       # Format
pnpm test         # Run TypeScript tests
npx pnpm test     # Use this outside nix-shell/direnv if pnpm is not on PATH
```

## Structure

```
src/                        # Core — zero Pi dependencies
  nvim.ts                  # Lockfile discovery + remote-expr RPC
  nvim.test.ts              # Tests for nvim.ts
  types.ts                  # Domain types + type guards
  format.ts                 # Shared formatting helpers (formatPath)
  undo/                    # Neovim persistent undo parsing + update helpers

extensions/
  nvim/                     # Main Pi extension
    index.ts                # Extension entry, registers hooks, tools, commands, renderers
    config/
      index.ts              # ConfigLoader, re-exports, emitNvimConfigUpdated
      types.ts              # Config types, interfaces, defaults, event constants
      migrations.ts         # Config migrations + migration message queue
    connection.ts           # Shared socket resolution + caching
    types.ts                # Tool detail types + severityColor
    tools/                  # LLM tools
    hooks/                  # Event hooks (editor state injection, lifecycle)
    commands/               # Slash commands
    components/             # Message renderers
  splits-autocomplete/       # @vim: autocomplete provider
    index.ts                # Extension entry
    provider.ts             # Autocomplete logic
    completion.ts           # Completion helpers
  undo/                     # Persistent undo command + disabled-by-default update hooks
    index.ts                # Extension entry; registers hooks immediately and gates by config inside handlers
    commands/               # /neovim:undotree command
    hooks/                  # edit/write tracking hooks that update Neovim persistent undo files
    components/             # Undo tree overlay and picker UI
    types.ts                # Event protocol for registering custom tools with the undo hooks

lua/
  pi-nvim/                 # Neovim plugin
    init.lua                # Plugin entry: setup(), query(), API exports
    config.lua              # User config defaults and merging
    health.lua              # :checkhealth pi-nvim
    actions/                # RPC query handlers (context, splits, diagnostics, reload, notify, ...)
    cli/                    # Pi terminal management (open/close/toggle), picker, file-watch timer
    rpc/                    # RPC server, lockfile creation, state
```

## Entry point deviation

This extension intentionally deviates from the standard load-config -> check-enabled -> register pattern. It has no `enabled` toggle because the extension must remain loadable both when bundled by the Neovim plugin and when installed directly via `pi install`. When Neovim is not running, all hooks and tools degrade gracefully instead of disabling the extension entirely.

## Undo hook registration protocol

Other Pi extensions can opt their file-writing tools into persistent-undo
updates by emitting `neovim:undo:register-tool` on the shared `pi.events` bus.

Valid registrations:
- a string tool name (uses `input.path`)
- `{ toolName: string, resolvePaths?: ({ input, cwd }) => string | string[] }`

The hook stores the resolver, snapshots existing files on `tool_call`, and
updates the matching Neovim undo files on successful `tool_result`. Missing or
deleted files are skipped.

`extensions/undo/hooks/index.ts` registers listeners immediately on extension
load and emits `neovim:undo:request-tools` so earlier-loaded extensions can
re-register.

## Documentation

README.md serves both audiences:
- Neovim users installing the plugin
- Pi users installing the extension directly

Keep `README.md` and `doc/pi-nvim.txt` aligned for user-facing install, configuration, command, tool, and API changes.

`doc/pi-nvim.txt` is the detailed Neovim help reference.
