local M = {}

local config = require('pi-nvim.config')
local terminal = require('pi-nvim.cli.terminal')
local source = require('pi-nvim.actions.source')
local watch = require('pi-nvim.cli.watch')

--- Get plugin root directory (where lua/ lives)
---@return string
local function get_plugin_root()
  local src = debug.getinfo(1, 'S').source:sub(2) -- Remove leading @
  -- src is: /path/to/integrations/neovim/lua/pi-nvim/cli/init.lua
  -- We want: /path/to/integrations/neovim
  return vim.fn.fnamemodify(src, ':h:h:h:h')
end

--- Check if nvim-pi is installed as a Pi package
--- Parses `pi list` for npm or git installs of nvim-pi
---@return boolean|nil true if found, false if not, nil if check failed
local function is_installed_globally()
  local ok, out = pcall(vim.fn.system, { 'pi', 'list' })
  if not ok or vim.v.shell_error ~= 0 then
    return nil
  end
  -- Match any pi list entry that resolves to nvim-pi (npm or git install)
  return out:match('npm:@aliou/nvim%-pi%s*$') ~= nil
      or out:match('git:github%.com/aliou/nvim%-pi%s*$') ~= nil
end

--- Build Pi command with extension
---@return string[]
function M.build_cmd()
  local cfg = config.get()

  local cmd = { 'pi' }

  -- Determine whether to pass --extension.
  -- load_extension: true  -> always pass --extension (default)
  -- load_extension: false -> never pass --extension
  -- load_extension: "auto" -> skip --extension if Pi has nvim-pi installed globally
  local load = cfg.load_extension
  if load == nil or load == true then
    local root = get_plugin_root()
    table.insert(cmd, '--extension')
    table.insert(cmd, root)
  elseif load == 'auto' then
    local installed = is_installed_globally()
    if not installed then
      local root = get_plugin_root()
      table.insert(cmd, '--extension')
      table.insert(cmd, root)
    end
  end

  -- Optional CLI flags from config
  if cfg.models then
    table.insert(cmd, '--models')
    table.insert(cmd, cfg.models)
  end
  if cfg.provider then
    table.insert(cmd, '--provider')
    table.insert(cmd, cfg.provider)
  end
  if cfg.model then
    table.insert(cmd, '--model')
    table.insert(cmd, cfg.model)
  end
  if cfg.thinking then
    table.insert(cmd, '--thinking')
    table.insert(cmd, cfg.thinking)
  end

  -- Extra args passthrough
  if cfg.extra_args then
    for _, arg in ipairs(cfg.extra_args) do
      table.insert(cmd, arg)
    end
  end

  return cmd
end

--- Open Pi terminal
function M.open()
  -- Check if Pi is installed
  if vim.fn.executable('pi') ~= 1 then
    vim.notify('[pi-nvim] pi command not found', vim.log.levels.ERROR)
    return
  end

  local term = terminal.get_current()
  if term then
    if not terminal.is_open(term) then
      terminal.show(term)
    else
      terminal.focus(term)
    end
    return
  end

  -- Save current window as source before opening terminal
  source.save()

  terminal.create(M.build_cmd())
  watch.enable()
end

--- Close Pi terminal (kills process)
function M.close()
  local term = terminal.get_current()
  if term then
    terminal.close(term)
    watch.disable()
  end
end

--- Toggle Pi terminal
function M.toggle()
  local term = terminal.get_current()
  if term and terminal.is_open(term) then
    M.close()
  else
    M.open()
  end
end

--- Check if Pi terminal is open
---@return boolean
function M.is_open()
  local term = terminal.get_current()
  return term ~= nil and terminal.is_open(term)
end

return M
