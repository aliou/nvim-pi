--- Follow mode: navigate and highlight where the Pi agent is reading/editing
local M = {}

local source = require('pi-nvim.actions.source')

--- State
local enabled = false
local ns = vim.api.nvim_create_namespace('pi_nvim_follow')
local clear_timer = nil
local highlight_timeout_ms = 1500

--- Default highlight groups (linked on first load)
local hl_setup = false
local function setup_highlight_groups()
  if hl_setup then return end
  hl_setup = true
  vim.api.nvim_set_hl(0, 'PiFollowRead', { default = true, link = 'Visual' })
  vim.api.nvim_set_hl(0, 'PiFollowEdit', { default = true, link = 'IncSearch' })
end

--- Check if follow mode is enabled
---@return boolean
function M.is_enabled()
  return enabled
end

--- Enable follow mode
function M.enable()
  enabled = true
end

--- Disable follow mode and clear any active highlight
function M.disable()
  enabled = false
  M.clear_highlight()
end

--- Toggle follow mode
function M.toggle()
  if enabled then
    M.disable()
  else
    M.enable()
  end
end

--- Clear the current follow highlight
function M.clear_highlight()
  if clear_timer then
    clear_timer:stop()
    clear_timer:close()
    clear_timer = nil
  end
  -- Clear all extmarks in our namespace across all buffers
  for _, buf in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_is_loaded(buf) then
      vim.api.nvim_buf_clear_namespace(buf, ns, 0, -1)
    end
  end
end

--- Apply a temporary highlight to a range in a buffer
---@param bufnr number
---@param start_line number 0-based
---@param end_line number 0-based (inclusive? we use end_row which is exclusive in extmarks)
---@param hl_group string
local function apply_highlight(bufnr, start_line, end_line, hl_group)
  setup_highlight_groups()
  M.clear_highlight()

  -- Ensure bounds
  local line_count = vim.api.nvim_buf_line_count(bufnr)
  start_line = math.max(0, math.min(start_line, line_count - 1))
  end_line = math.max(start_line, math.min(end_line, line_count - 1))

  vim.api.nvim_buf_set_extmark(bufnr, ns, start_line, 0, {
    end_row = end_line + 1, -- extmark end_row is exclusive
    end_col = 0,
    hl_group = hl_group,
    hl_eol = true,
    priority = 200,
  })

  -- Timer to clear
  clear_timer = vim.uv.new_timer()
  if clear_timer then
    clear_timer:start(highlight_timeout_ms, 0, function()
      vim.schedule(function()
        M.clear_highlight()
      end)
    end)
  end
end

--- Resolve target window for follow navigation
---@return number|nil win
local function resolve_target_window()
  local win = source.get_win()
  if win and vim.api.nvim_win_is_valid(win) then
    return win
  end
  -- Fallback: first non-floating, non-terminal window
  for _, w in ipairs(vim.api.nvim_list_wins()) do
    if vim.api.nvim_win_is_valid(w) then
      local config = vim.api.nvim_win_get_config(w)
      if config.relative == '' then
        local buf = vim.api.nvim_win_get_buf(w)
        local bt = vim.bo[buf].buftype
        if bt ~= 'terminal' then
          return w
        end
      end
    end
  end
  return nil
end

--- Open or switch to a file in the target window, adding jumplist entry
---@param file_path string Absolute path
---@param target_win number
---@return number|nil bufnr
local function open_file_in_window(file_path, target_win)
  -- Check if buffer already exists for this file
  local bufnr = vim.fn.bufnr(file_path)

  if bufnr == -1 then
    -- Buffer doesn't exist, open it
    vim.api.nvim_win_call(target_win, function()
      vim.cmd('keepjumps edit ' .. vim.fn.fnameescape(file_path))
    end)
    bufnr = vim.fn.bufnr(file_path)
  else
    -- Buffer exists, switch to it in the target window
    local current_buf = vim.api.nvim_win_get_buf(target_win)
    if current_buf ~= bufnr then
      -- Push jumplist entry for current position before switching
      vim.api.nvim_win_call(target_win, function()
        vim.cmd('normal! m\'')
      end)
      vim.api.nvim_win_set_buf(target_win, bufnr)
    end
  end

  return bufnr
end

--- Navigate to a position and highlight a range
---@param file_path string Absolute file path
---@param line number 1-based line number to position cursor
---@param end_line number|nil 1-based end line for highlight (defaults to line)
---@param hl_group string Highlight group name
local function navigate_and_highlight(file_path, line, end_line, hl_group)
  local target_win = resolve_target_window()
  if not target_win then return end

  local bufnr = open_file_in_window(file_path, target_win)
  if not bufnr or bufnr == -1 then return end

  -- Clamp line to buffer bounds
  local line_count = vim.api.nvim_buf_line_count(bufnr)
  line = math.max(1, math.min(line, line_count))
  end_line = end_line and math.max(line, math.min(end_line, line_count)) or line

  -- Add jumplist entry for current position before moving
  vim.api.nvim_win_call(target_win, function()
    vim.cmd('normal! m\'')
  end)

  -- Set cursor position
  vim.api.nvim_win_set_cursor(target_win, { line, 0 })

  -- Apply highlight (convert to 0-based for extmarks)
  apply_highlight(bufnr, line - 1, end_line - 1, hl_group)
end

--- Handle a follow event from Pi
---@param payload table
---  - kind: "read" | "edit" | "write"
---  - path: string (absolute file path)
---  - offset?: number (1-based line for reads)
---  - limit?: number (line count for reads)
---  - firstChangedLine?: number (1-based line for edits)
function M.handle(payload)
  if not enabled then return end
  if not payload or not payload.path then return end

  local file_path = payload.path

  -- Validate path exists (for reads)
  if payload.kind == 'read' then
    if vim.fn.filereadable(file_path) ~= 1 then return end
    local offset = payload.offset or 1
    local limit = payload.limit or 50
    local end_line = offset + limit - 1
    navigate_and_highlight(file_path, offset, end_line, 'PiFollowRead')

  elseif payload.kind == 'edit' then
    local line = payload.firstChangedLine or 1
    navigate_and_highlight(file_path, line, line, 'PiFollowEdit')

  elseif payload.kind == 'write' then
    navigate_and_highlight(file_path, 1, 1, 'PiFollowEdit')
  end
end

M.execute = M.handle

return M
