# @aliou/nvim-pi

Neovim plugin with a bundled Pi extension.

This package works in two modes:
- install it as a Neovim plugin and let it launch Pi with the bundled extension
- install it with `pi install pi:github.com/aliou/nvim-pi` and use the extension directly in terminal Pi sessions

When Neovim is not running, the extension still loads cleanly and degrades gracefully.

## What it provides

### Pi extension

| Tool / Command | Description |
|---|---|
| `nvim_context` | Query the connected Neovim instance for editor context, splits, diagnostics, or current function |
| `/neovim:settings` | Configure Neovim integration settings for the Pi extension |

Behavior provided by hooks:
- automatically discovers and connects to a matching Neovim instance on session start
- injects visible split context into the system prompt on each turn
- reloads files in Neovim after successful `write` and `edit` tool calls
- sends LSP diagnostics for modified files after the turn ends

### Neovim plugin

- starts a Neovim RPC server and writes lockfiles Pi can discover
- opens Pi in a terminal split or float
- passes through selected Pi CLI flags
- runs a periodic `checktime` timer while Pi is open to detect external file changes
- provides a context picker (`<C-Space>` by default) to send editor context to Pi
- exposes `:PiNvimStatus`

## Setup

### As a Neovim plugin

Install this repo as a Neovim plugin. The `lua/` directory is runtimepath-compatible.

Example with `lazy.nvim`:

```lua
{
  dir = "/absolute/path/to/nvim-pi",
  config = function()
    require("pi-nvim").setup()
  end,
}
```

Manual setup:

```lua
vim.opt.runtimepath:append(vim.fn.expand("/absolute/path/to/nvim-pi"))
require("pi-nvim").setup()
```

Requirements:
- `pi` must be on `PATH`
- `nvim` must support `serverstart()` and `--remote-expr`

When you open Pi through `pi-nvim`, the plugin launches:

```bash
pi --extension /absolute/path/to/nvim-pi
```

The extension then injects its Neovim guidance and runtime editor context through hooks.

### As a Pi extension

You can also install it directly in Pi:

```bash
pi install pi:github.com/aliou/nvim-pi
```

This is useful if you want the extension available in terminal Pi sessions too. If no Neovim instance is running, the extension still loads and simply reports that no instance was found when needed.

## Configuration

### Pi extension config

`/neovim:settings` currently exposes:

| Setting | Default | Description |
|---|---|---|
| `Connection status messages` | `on` | Show `nvim: connected` / `no instance found` style messages in the Pi session |

### Neovim plugin config

```lua
require("pi-nvim").setup({
  auto_start = true,
  data_dir = nil,

  -- Pi CLI flags
  models = nil,
  provider = nil,
  model = nil,
  thinking = nil,
  extra_args = nil,

  -- Window configuration
  win = {
    layout = "auto",
    width_threshold = 150,
    width = 80,
    height = 20,
    focus_source_on_stopinsert = true, -- switch to source window on exiting terminal mode
    keys = {
      close = { "<C-q>", mode = "n", desc = "Close Pi" },
      stopinsert = { "<C-q>", mode = "t", desc = "Exit terminal mode" },
      suspend = { "<C-z>", mode = "t", desc = "Suspend Neovim" },
      picker = { "<C-Space>", mode = "t", desc = "Open context picker" },
    },
  },
})
```

## Keymaps

The plugin does not create global leader mappings by default.

Example mappings:

```lua
vim.keymap.set("n", "<leader>po", require("pi-nvim").open, { desc = "Open Pi" })
vim.keymap.set("n", "<leader>pc", require("pi-nvim").close, { desc = "Close Pi" })
vim.keymap.set("n", "<leader>pp", require("pi-nvim").toggle, { desc = "Toggle Pi" })
```

Terminal/window-local keys are configured under `setup({ win = { keys = ... } })`.

## Usage

### From Pi

The `nvim_context` tool supports these actions:
- `context` - focused file, cursor position, selection, filetype
- `splits` - all visible splits with metadata
- `diagnostics` - diagnostics for the current buffer
- `current_function` - treesitter info for the symbol at the cursor

If multiple matching Neovim instances are found, Pi prompts you to choose one when UI is available.

### From Neovim

Commands and API:
- `:PiNvimStatus` - show RPC and terminal state
- `require("pi-nvim").open()` - open the Pi terminal
- `require("pi-nvim").close()` - close the Pi terminal
- `require("pi-nvim").toggle()` - toggle the Pi terminal
- `require("pi-nvim").start()` - start the RPC server manually
- `require("pi-nvim").stop()` - stop the RPC server manually
- `require("pi-nvim").status()` - get the current RPC state
- `require("pi-nvim").is_open()` - check if the Pi terminal is open

## Troubleshooting

### Pi cannot find Neovim

Check:
- `:PiNvimStatus` shows the RPC server as running
- `pi` and `nvim` are both on `PATH`
- lockfiles exist under Neovim's data dir, usually `~/.local/share/nvim/pi-nvim/`

Discovery prefers:
1. exact cwd matches
2. Neovim instances whose cwd is a child of Pi's cwd

### Multiple Neovim instances found

Pi will prompt for selection in interactive mode. In non-interactive mode, the tool returns an error instead of guessing.

### RPC server errors

Check:
- `<stdpath('log')>/pi-nvim/rpc.log` (typically `~/.local/state/nvim/pi-nvim/rpc.log`)
- `:PiNvimStatus`

### Healthcheck

```vim
:checkhealth pi-nvim
```

## Architecture

```text
Neovim plugin (Lua)                            Pi extension (TypeScript)
-------------------                            ------------------------
require("pi-nvim").setup()                    pi --extension /path/to/nvim-pi
          |                                                   |
          v                                                   v
   rpc.start()                                     src/index.ts registers:
   lockfile.create()                               - hooks (system prompt, nvim context)
          |                                      - tool (nvim_context)
          v                                      - command (/neovim:settings)
~/.local/share/nvim/pi-nvim/                       - renderers (connection, diagnostics)
<cwd-hash>-<pid>.json                                           |
          |                                          session_start discovers lockfile
          |                                          before_agent_start queries splits
          |                                          tool_result reloads files
          |                                          turn_end requests diagnostics
          v                                                   |
   nvim --server <socket> --remote-expr <luaeval(...)> <------+

Additional Lua features:
  cli/terminal     open/close/toggle Pi in a split or float
  cli/picker       <C-Space> context picker to send info to Pi
  cli/watch        periodic checktime timer while Pi is open
```

The TypeScript extension discovers Neovim instances through lockfiles, then queries the running editor through `nvim --remote-expr`, which evaluates `require("pi-nvim").query(...)` inside Neovim.
