# nvim-pi

Public Pi extension bundled with a Neovim plugin. People could be using this through either Neovim plugin install or `pi install pi:github.com/aliou/nvim-pi`, so keep backwards compatibility in mind when making changes.

Pi is pre-1.0.0, so breaking changes can happen between Pi versions. This extension must stay up to date with Pi or things will break.

## Stack

- TypeScript (strict mode)
- Lua (Neovim plugin)
- pnpm 10.26.1
- Biome for linting/formatting
- Vitest for TypeScript tests
- shell.nix + .envrc for local dev environment
- lefthook for pre-commit checks

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
src/
  index.ts            # Extension entry, registers hooks, tools, commands, renderers
  config.ts           # Configuration loading and defaults
  nvim.ts             # Lockfile discovery + remote-expr RPC
  tools/              # LLM tools
  hooks/              # Event hooks
  commands/           # Slash commands
  components/         # Message renderers
  utils/              # Shared connection helpers and RPC result types
lua/
  pi-nvim/            # Neovim plugin
```

## Entry point deviation

This extension intentionally deviates from the standard load-config -> check-enabled -> register pattern. It has no `enabled` toggle because the extension must remain loadable both when bundled by the Neovim plugin and when installed directly via `pi install`. When Neovim is not running, all hooks and tools degrade gracefully instead of disabling the extension entirely.

## Documentation

README.md serves both audiences:
- Neovim users installing the plugin
- Pi users installing the extension directly

`doc/pi-nvim.txt` is the detailed Neovim help reference.
