local M = {}

local config = require('pi-nvim.config')

--- Tracked herdr pane created by this Neovim instance.
---@class pi.HerdrPane
---@field pane_id string
---@field agent_name string

---@type pi.HerdrPane|nil
local current = nil

-- Throttle the unsupported-layout fallback notice to once per session.
local noticed_fallback = false

--- Whether Neovim is running inside a herdr-managed pane.
--- herdr sets HERDR_ENV=1 and exports HERDR_SOCKET_PATH / HERDR_PANE_ID for
--- every pane process it owns.
---@return boolean
function M.inside()
  return vim.env.HERDR_ENV == '1'
    and vim.env.HERDR_SOCKET_PATH ~= nil and vim.env.HERDR_SOCKET_PATH ~= ''
    and vim.env.HERDR_PANE_ID ~= nil and vim.env.HERDR_PANE_ID ~= ''
end

--- Whether herdr support is active for the current request: opted in via
--- config and Neovim is itself running inside herdr.
---@return boolean
function M.active()
  local cfg = config.get()
  return cfg.herdr ~= nil and cfg.herdr.enabled == true and M.inside()
end

---@return string
local function bin()
  return vim.env.HERDR_BIN_PATH or 'herdr'
end

--- Run a herdr CLI command synchronously and return parsed JSON, or nil + err.
--- Uses the argv list form so paths and flags never go through a shell.
---@param args string[]
---@return table|nil, string|nil
local function run_sync(args)
  local out = vim.fn.system({ bin(), unpack(args) })
  if vim.v.shell_error ~= 0 then
    return nil, out
  end
  local ok, decoded = pcall(vim.json.decode, out)
  if not ok then
    return nil, 'invalid JSON: ' .. tostring(decoded) .. '\n' .. out
  end
  return decoded, nil
end

--- Run a herdr CLI command whose successful response intentionally has no
--- stdout, such as `pane run`.
---@param args string[]
---@return boolean, string|nil
local function run_ok(args)
  local out = vim.fn.system({ bin(), unpack(args) })
  if vim.v.shell_error ~= 0 then
    return false, out
  end
  return true, nil
end

--- Map the configured window layout to a herdr split direction.
--- herdr only splits right or down; left/top/float are unsupported in v1 and
--- signal the caller to fall back to the normal Neovim split path.
---@return string|nil "right"|"down", or nil to fall back
local function resolve_direction()
  local cfg = config.get()
  local layout = cfg.win.layout
  if layout == 'auto' then
    layout = vim.o.columns >= cfg.win.width_threshold and 'right' or 'bottom'
  end
  if layout == 'right' then
    return 'right'
  end
  if layout == 'bottom' then
    return 'down'
  end
  return nil
end

---@param direction string
---@return number
local function resolve_ratio(direction)
  local cfg = config.get()
  local new_pane_ratio
  if direction == 'right' then
    new_pane_ratio = cfg.win.width / vim.o.columns
  else
    new_pane_ratio = cfg.win.height / vim.o.lines
  end
  new_pane_ratio = math.max(0.1, math.min(0.9, new_pane_ratio))
  -- herdr stores the ratio for the first child: the existing Neovim pane.
  return 1 - new_pane_ratio
end

--- Whether a candidate satisfies herdr's `[a-z][a-z0-9_-]{0,31}` name rule.
---@param name string
---@return boolean
local function valid_agent_name(name)
  return #name <= 32 and name:match('^[a-z][a-z0-9_-]*$') ~= nil
end

-- Warn once when a configured agent_name cannot be used.
local warned_invalid_name = false

--- Default agent name: a stable per-working-directory identifier,
--- `pi-<cwd-basename>-<sha256(cwd)[1:8]>`.
---@return string
local function default_agent_name()
  local cfg = config.get()
  local configured = cfg.herdr.agent_name
  if configured and configured ~= '' then
    if valid_agent_name(configured) then
      return configured
    end
    if not warned_invalid_name then
      warned_invalid_name = true
      vim.notify(
        '[pi-nvim] herdr.agent_name must match [a-z][a-z0-9_-]{0,31}; using the default name',
        vim.log.levels.WARN
      )
    end
  end
  local cwd = vim.fn.getcwd()
  local name = vim.fn.fnamemodify(cwd, ':t'):lower():gsub('[^a-z0-9_-]', '-'):gsub('^-+', ''):gsub('-+$', '')
  if name == '' then
    name = 'project'
  end
  return string.format('pi-%s-%s', name:sub(1, 20), vim.fn.sha256(cwd):sub(1, 8))
end

---@param pane_id string
---@return boolean
function M.pane_alive(pane_id)
  local res = run_sync({ 'pane', 'get', pane_id })
  return res ~= nil
end

---@param pane_id string
function M.focus_pane(pane_id)
  run_sync({ 'agent', 'focus', pane_id })
end

---@param agent_name string
---@return string|nil
local function find_agent_pane(agent_name)
  local res = run_sync({ 'agent', 'get', agent_name })
  local agent = res and res.result and res.result.agent
  if agent and agent.agent == 'pi' then
    return agent.pane_id
  end

  local listed = run_sync({ 'agent', 'list' })
  local agents = listed and listed.result and listed.result.agents or {}
  local cwd = vim.fn.getcwd()
  for _, candidate in ipairs(agents) do
    if candidate.agent == 'pi'
        and candidate.workspace_id == vim.env.HERDR_WORKSPACE_ID
        and (candidate.cwd == cwd or candidate.foreground_cwd == cwd) then
      return candidate.pane_id
    end
  end
  return nil
end

---@param pane_id string
---@param agent_name string
---@param attempts number
local function schedule_agent_rename(pane_id, agent_name, attempts)
  vim.defer_fn(function()
    if not current or current.pane_id ~= pane_id then
      return
    end
    local renamed = run_sync({ 'agent', 'rename', pane_id, agent_name })
    if not renamed and attempts > 1 then
      schedule_agent_rename(pane_id, agent_name, attempts - 1)
    end
  end, 250)
end

--- Launch Pi in an existing herdr pane and schedule its agent rename.
---@param pane_id string
---@param agent_name string
---@return boolean
local function start_pi(pane_id, agent_name)
  local pi_cmd = require('pi-nvim.cli').build_cmd()
  local command = table.concat(vim.tbl_map(vim.fn.shellescape, pi_cmd), ' ')
  if vim.uv.os_uname().sysname ~= 'Windows_NT' then
    command = 'exec ' .. command
  end
  local ran, err = run_ok({ 'pane', 'run', pane_id, command })
  if not ran then
    vim.notify('[pi-nvim] herdr pane run failed: ' .. tostring(err), vim.log.levels.ERROR)
    return false
  end
  -- Pi is detected asynchronously. Once it is, give it the stable name used
  -- for future reattachment; retries cover Pi and integration startup time.
  schedule_agent_rename(pane_id, agent_name, 40)
  return true
end

--- Open (or focus) Pi in a herdr pane split off the current pane.
--- Returns true when handled (including when an existing pane was focused);
--- returns false when the configured layout is unsupported and the caller
--- should fall back to the normal Neovim split path.
---@return boolean
function M.open()
  local cfg = config.get()
  local direction = resolve_direction()
  if direction == nil then
    if not noticed_fallback then
      noticed_fallback = true
      vim.notify(
        '[pi-nvim] herdr support only supports right/bottom layouts; using Neovim split',
        vim.log.levels.INFO
      )
    end
    return false
  end

  -- Reuse the pane created in this Neovim process if it is still alive.
  if current and M.pane_alive(current.pane_id) then
    M.focus_pane(current.pane_id)
    return true
  end

  -- Pi panes outlive Neovim. Reattach after a Neovim restart before creating
  -- another pane, using the stable cwd-derived agent name.
  local agent_name = default_agent_name()
  local existing_pane = find_agent_pane(agent_name)
  if existing_pane then
    current = { pane_id = existing_pane, agent_name = agent_name }
    M.focus_pane(existing_pane)
    return true
  end

  local ratio = resolve_ratio(direction)
  local focus = cfg.herdr.focus ~= false

  local split_args = {
    'pane', 'split', '--current',
    '--direction', direction,
    '--ratio', string.format('%.3f', ratio),
    '--cwd', vim.fn.getcwd(),
    focus and '--focus' or '--no-focus',
  }

  local res, err = run_sync(split_args)
  if not res then
    vim.notify('[pi-nvim] herdr pane split failed: ' .. tostring(err), vim.log.levels.ERROR)
    return true
  end
  local pane_id = res and res.result and res.result.pane and res.result.pane.pane_id
  if not pane_id then
    vim.notify('[pi-nvim] herdr pane split returned no pane id', vim.log.levels.ERROR)
    return true
  end

  current = { pane_id = pane_id, agent_name = agent_name }

  -- Herdr splits create a shell pane. `pane run` submits the exact, safely
  -- quoted Pi argv to that shell without waiting for Herdr to classify the
  -- shell as ready. On Unix, `exec` replaces that shell with Pi.
  if not start_pi(pane_id, agent_name) then
    current = nil
    run_sync({ 'pane', 'close', pane_id })
  end

  return true
end

--- Close the herdr pane this Neovim instance created, if any.
function M.close()
  if not current then
    return
  end
  run_sync({ 'pane', 'close', current.pane_id })
  current = nil
end

---@return boolean
function M.is_open()
  return current ~= nil and M.pane_alive(current.pane_id)
end

--- Forget the tracked pane without closing it. Pi runs independently in herdr
--- and should survive Neovim exit for reattachment on the next launch.
function M.detach()
  current = nil
end

return M
